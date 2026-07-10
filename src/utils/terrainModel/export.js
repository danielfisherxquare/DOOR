import PizZip from 'pizzip'
import {
  EXPORT_COORDINATE_SYSTEMS,
  buildExportFilenamePolicy,
  toAsciiSafeExportBaseName as toSharedAsciiSafeExportBaseName,
} from '../exportManifest.js'
import { colorDistanceSq, hexToRgb } from './color.js'
import { toPrintCoordinateVertex } from './coordinates.js'
import { clamp, pickNumber, round } from './numeric.js'
import {
  DEFAULT_FILAMENT_TYPE,
  FILAMENT_PROFILES,
  PRINT_LAYER_LOCK_OVERLAP_MM,
  PRINT_READABLE_MAX_FOOTPRINT_RATIO,
} from './printConfig.js'
import { getTerrainSurfaceUv } from './surfaceTexture.js'

function computeNormal(a, b, c) {
  const ux = b.x - a.x
  const uy = b.y - a.y
  const uz = b.z - a.z
  const vx = c.x - a.x
  const vy = c.y - a.y
  const vz = c.z - a.z
  const normal = {
    x: uy * vz - uz * vy,
    y: uz * vx - ux * vz,
    z: ux * vy - uy * vx,
  }
  const length = Math.hypot(normal.x, normal.y, normal.z) || 1
  return {
    x: normal.x / length,
    y: normal.y / length,
    z: normal.z / length,
  }
}

function stlNumber(value) {
  return Number.isFinite(value) ? value.toFixed(5) : '0.00000'
}

function transformMeshToSlicerZUp(mesh, verticalOffsetMm = 0) {
  return {
    name: mesh.name,
    vertices: mesh.vertices.map((vertex) => toPrintCoordinateVertex(vertex, verticalOffsetMm)),
    faces: mesh.faces.map(([a, b, c]) => [a, c, b]),
  }
}

function getSlicerZUpVerticalOffset(meshes) {
  let minY = Number.POSITIVE_INFINITY
  for (const mesh of meshes || []) {
    for (const vertex of mesh?.vertices || []) {
      if (Number.isFinite(vertex?.y) && vertex.y < minY) minY = vertex.y
    }
  }
  if (!Number.isFinite(minY) || minY >= 0) return 0
  return -minY
}

export function meshToAsciiStl(mesh, solidName = 'door_model', options = {}) {
  const exportMesh = transformMeshToSlicerZUp(mesh, pickNumber(options.verticalOffsetMm, 0))
  const safeName = String(solidName || 'door_model').replace(/[^a-z0-9_-]+/gi, '_')
  const lines = [`solid ${safeName}`]
  exportMesh.faces.forEach((face) => {
    const a = exportMesh.vertices[face[0]]
    const b = exportMesh.vertices[face[1]]
    const c = exportMesh.vertices[face[2]]
    const normal = computeNormal(a, b, c)
    lines.push(`  facet normal ${stlNumber(normal.x)} ${stlNumber(normal.y)} ${stlNumber(normal.z)}`)
    lines.push('    outer loop')
    ;[a, b, c].forEach((vertex) => {
      lines.push(`      vertex ${stlNumber(vertex.x)} ${stlNumber(vertex.y)} ${stlNumber(vertex.z)}`)
    })
    lines.push('    endloop')
    lines.push('  endfacet')
  })
  lines.push(`endsolid ${safeName}`)
  return `${lines.join('\n')}\n`
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function threeMfNumber(value) {
  return Number.isFinite(value) ? Number(value).toFixed(5) : '0.00000'
}

function threeMfTextureContentType(mimeType) {
  if (/png/i.test(mimeType)) return 'image/png'
  if (/jpe?g/i.test(mimeType)) return 'image/jpeg'
  return null
}

function getThreeMfTexturePath(textureFile) {
  return textureFile?.name ? '/3D/Textures/' + textureFile.name : null
}

function isThreeMfEmbeddableTexture(surfaceTextureExport) {
  const contentType = threeMfTextureContentType(surfaceTextureExport?.file?.mimeType || '')
  return Boolean(contentType && surfaceTextureExport?.file?.content?.length && getThreeMfTexturePath(surfaceTextureExport.file))
}

function getThreeMfTextureCoord(vertex, dimensions) {
  const uv = getTerrainSurfaceUv(vertex, dimensions)
  return {
    u: uv.u,
    v: Math.max(0, Math.min(1, 1 - uv.v)),
  }
}

function isTopTerrainFace(mesh, face) {
  return face.every((index) => {
    const vertex = mesh.vertices[index]
    return Number.isFinite(vertex?.y) && vertex.y > 0
  })
}

function meshToThreeMfObject(mesh, id, name, materialIndex, verticalOffsetMm = 0, options = {}) {
  const materialGroupId = Number.isInteger(options.materialGroupId) ? options.materialGroupId : 1
  const vertices = mesh.vertices.map((vertex) => {
    const printVertex = toPrintCoordinateVertex(vertex, verticalOffsetMm)
    return '<vertex x="' + threeMfNumber(printVertex.x) + '" y="' + threeMfNumber(printVertex.y) + '" z="' + threeMfNumber(printVertex.z) + '"/>'
  }).join('')
  const textureEnabled = Boolean(options.textureGroupId && options.textureDimensions)
  const textureCoords = textureEnabled
    ? mesh.vertices.map((vertex) => {
      const uv = getThreeMfTextureCoord(vertex, options.textureDimensions)
      return '<m:tex2coord u="' + threeMfNumber(uv.u) + '" v="' + threeMfNumber(uv.v) + '"/>'
    }).join('')
    : ''
  let texturedTriangleCount = 0
  const triangles = mesh.faces.map((face) => {
    const v1 = face[0]
    const v2 = face[2]
    const v3 = face[1]
    if (textureEnabled && isTopTerrainFace(mesh, face)) {
      texturedTriangleCount += 1
      return '<triangle v1="' + v1 + '" v2="' + v2 + '" v3="' + v3 + '" pid="' + options.textureGroupId + '" p1="' + v1 + '" p2="' + v2 + '" p3="' + v3 + '"/>'
    }
    return '<triangle v1="' + v1 + '" v2="' + v2 + '" v3="' + v3 + '" p1="' + materialIndex + '" p2="' + materialIndex + '" p3="' + materialIndex + '"/>'
  }).join('')
  const objectXml = [
    '<object id="' + id + '" type="model" name="' + xmlEscape(name) + '" pid="' + materialGroupId + '" pindex="' + materialIndex + '">',
    '<mesh>',
    '<vertices>' + vertices + '</vertices>',
    '<triangles>' + triangles + '</triangles>',
    '</mesh>',
    '</object>',
  ].join('')
  return { objectXml, textureCoords, texturedTriangleCount }
}

function colorWithoutAlpha(displayColor) {
  const value = String(displayColor || '').trim()
  const match = value.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i)
  return match ? '#' + match[1].toUpperCase() : '#808080'
}

function getTerrainPartDisplayColor(model = {}) {
  const satelliteBands = model.colorBands?.satelliteBands
  if (satelliteBands?.strategy === 'balanced' && Array.isArray(satelliteBands.bands) && satelliteBands.bands.length) {
    const dominantBand = satelliteBands.bands.reduce((best, band) => (
      pickNumber(band.coveredTriangleCount, 0) > pickNumber(best?.coveredTriangleCount, 0) ? band : best
    ), satelliteBands.bands[0])
    return colorWithoutAlpha(dominantBand?.displayColor) + 'FF'
  }
  return '#C79435FF'
}

const BAMBU_H2C_PRINT_PROFILE = {
  application: 'BambuStudio-02.07.00.55',
  clientVersion: '02.07.00.55',
  printerSettingsId: 'Bambu Lab H2C 0.4 nozzle',
  printerModel: 'Bambu Lab H2C',
  printerModelId: 'O1C2',
  printerVariant: '0.4',
  printSettingsId: '0.20mm High Quality @BBL H2C',
  filamentSettingsId: 'Bambu PLA Basic @BBL H2C',
  filamentId: 'GFA00',
  filamentType: 'PLA',
  filamentVendor: 'Bambu Lab',
}

const BAMBU_H2C_NOZZLE_PROFILE = {
  nozzleType: ['hardened_steel', 'hardened_steel', 'hardened_steel', 'hardened_steel'],
  nozzleDiameter: ['0.4', '0.4'],
  nozzleVolume: ['130', '133', '145', '148'],
  nozzleVolumeType: ['Standard', 'Standard'],
  defaultNozzleVolumeType: ['Standard', 'Standard'],
  extruderMaxNozzleCount: ['1', '6'],
  extruderType: ['Direct Drive', 'Direct Drive'],
  extruderOffset: ['0x0', '0x0'],
  extruderNozzleStats: ['Standard#1', 'Standard#4'],
  extruderVariantList: [
    'Direct Drive Standard,Direct Drive High Flow',
    'Direct Drive Standard,Direct Drive High Flow',
  ],
  extruderPrintableArea: [
    '0x0,325x0,325x320,0x320',
    '25x0,330x0,330x320,25x320',
  ],
  extruderPrintableHeight: ['320', '325'],
  printerExtruderId: ['1', '1', '2', '2'],
  printerExtruderVariant: [
    'Direct Drive Standard',
    'Direct Drive High Flow',
    'Direct Drive Standard',
    'Direct Drive High Flow',
  ],
  physicalExtruderMap: ['1', '0'],
  printableArea: ['0x0', '330x0', '330x320', '0x320'],
  printableHeight: '325',
  printCompatiblePrinters: ['Bambu Lab H2C 0.4 nozzle'],
  upwardCompatibleMachine: [
    'Bambu Lab H2S 0.4 nozzle',
    'Bambu Lab H2D 0.4 nozzle',
    'Bambu Lab H2D Pro 0.4 nozzle',
  ],
}

const BAMBU_BUILD_TRANSFORM = '1 0 0 0 1 0 0 0 1 165 160 0'

function getBambuPartObjectId(index) {
  return index + 1
}

function getBambuAssemblyObjectId(printableParts) {
  return printableParts.length + 1
}

function getBambuExtruderPlan(printableParts) {
  const MAX_EXTRUDERS = 6
  const partColors = printableParts.map((part) => colorWithoutAlpha(part.displayColor))
  const preferredColors = ['#C79435', '#1F9F72', '#D63B2E', '#171717', '#F5F5F4']
  const filamentColors = []
  preferredColors.forEach((color) => {
    if (partColors.includes(color) && !filamentColors.includes(color)) {
      filamentColors.push(color)
    }
  })
  partColors.forEach((color) => {
    if (!filamentColors.includes(color)) {
      filamentColors.push(color)
    }
  })

  // H2C supports max 6 extruder slots. Truncate at the hardware limit.
  // Parts whose colour falls outside the first 6 slots get assigned to
  // the nearest available slot (Bambu Studio applies a similar fallback).
  const cappedColors = filamentColors.slice(0, MAX_EXTRUDERS)
  return {
    filamentColors: cappedColors,
    extruderByPartIndex: partColors.map((color) => {
      const idx = cappedColors.indexOf(color)
      // If colour was truncated, map to the nearest available slot
      if (idx >= 0) return idx + 1
      let bestIdx = 0; let bestDist = Infinity
      const partRgb = hexToRgb(color)
      for (let i = 0; i < cappedColors.length; i += 1) {
        const candidateRgb = hexToRgb(cappedColors[i])
        const d = colorDistanceSq(
          [partRgb.r, partRgb.g, partRgb.b],
          [candidateRgb.r, candidateRgb.g, candidateRgb.b],
        )
        if (d < bestDist) { bestDist = d; bestIdx = i }
      }
      return bestIdx + 1
    }),
  }
}

function bambuUuid(kind, index) {
  if (kind === 'component') {
    return String(index + 1).padStart(4, '0') + '0000-b206-40ff-9872-83e8017abed1'
  }
  if (kind === 'subobject') {
    return String(index + 1).padStart(4, '0') + '0000-81cb-4c03-9d28-80fed5dfa1dc'
  }
  if (kind === 'build') {
    return String(index + 1).padStart(8, '0') + '-b1ec-4553-aec9-835e5b724bb4'
  }
  return String(index + 1).padStart(8, '0') + '-61cb-4c03-9d28-80fed5dfa1dc'
}

function meshToBambuObjectModel(mesh, objectId, name, verticalOffsetMm = 0) {
  const vertices = mesh.vertices.map((vertex) => {
    const printVertex = toPrintCoordinateVertex(vertex, verticalOffsetMm)
    return '<vertex x="' + threeMfNumber(printVertex.x) + '" y="' + threeMfNumber(printVertex.y) + '" z="' + threeMfNumber(printVertex.z) + '"/>'
  }).join('')
  const triangles = mesh.faces.map((face) => (
    '<triangle v1="' + face[0] + '" v2="' + face[2] + '" v3="' + face[1] + '"/>'
  )).join('')
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">',
    '<metadata name="BambuStudio:3mfVersion">1</metadata>',
    '<resources>',
    '<object id="' + objectId + '" p:UUID="' + bambuUuid('subobject', objectId - 1) + '" type="model" name="' + xmlEscape(name) + '">',
    '<mesh>',
    '<vertices>' + vertices + '</vertices>',
    '<triangles>' + triangles + '</triangles>',
    '</mesh>',
    '</object>',
    '</resources>',
    '<build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">',
    '<item objectid="' + objectId + '" p:UUID="' + bambuUuid('build', objectId - 1) + '" transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1"/>',
    '</build>',
    '</model>',
  ].join('\n')
}

function buildBambuRootModel(baseName, printableParts) {
  const assemblyObjectId = getBambuAssemblyObjectId(printableParts)
  const components = printableParts.map((part, index) => {
    const subObjectId = getBambuPartObjectId(index)
    return '<component p:path="/3D/Objects/object_' + (index + 1) + '.model" objectid="' + subObjectId + '" p:UUID="' + bambuUuid('component', index) + '" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>'
  }).join('\n')
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">',
    '<metadata name="Application">' + xmlEscape(BAMBU_H2C_PRINT_PROFILE.application) + '</metadata>',
    '<metadata name="BambuStudio:3mfVersion">1</metadata>',
    '<metadata name="Title">' + xmlEscape(baseName) + '</metadata>',
    '<resources>',
    '<object id="' + assemblyObjectId + '" p:UUID="' + bambuUuid('object', assemblyObjectId - 1) + '" type="model" name="' + xmlEscape(baseName) + '">',
    '<components>',
    components,
    '</components>',
    '</object>',
    '</resources>',
    '<build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">',
    '<item objectid="' + assemblyObjectId + '" p:UUID="' + bambuUuid('build', 0) + '" transform="' + BAMBU_BUILD_TRANSFORM + '" printable="1"/>',
    '</build>',
    '</model>',
  ].join('\n')
}

function buildBambuModelSettings(baseName, printableParts, extruderPlan) {
  const assemblyObjectId = getBambuAssemblyObjectId(printableParts)
  const totalFaceCount = printableParts.reduce((total, part) => total + part.mesh.faces.length, 0)
  const filamentSlotIndexes = extruderPlan?.filamentColors?.length
    ? extruderPlan.filamentColors.map((_, i) => String(i + 1)).join(' ')
    : printableParts.map((_, i) => String(i + 1)).join(' ')
  const filamentVolumeMaps = (extruderPlan?.filamentColors?.length ? extruderPlan.filamentColors : printableParts)
    .map(() => '0')
    .join(' ')
  const partXml = printableParts.map((part, index) => {
    const partId = getBambuPartObjectId(index)
    const extruderIndex = extruderPlan?.extruderByPartIndex?.[index] || index + 1
    return [
      '<part id="' + partId + '" subtype="normal_part">',
      '<metadata key="name" value="' + xmlEscape(part.threeMfName) + '"/>',
      '<metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>',
      '<metadata key="source_file" value="' + xmlEscape(baseName + '-bambu-print.3mf') + '"/>',
      '<metadata key="source_object_id" value="0"/>',
      '<metadata key="source_volume_id" value="' + index + '"/>',
      '<metadata key="source_offset_x" value="0"/>',
      '<metadata key="source_offset_y" value="0"/>',
      '<metadata key="source_offset_z" value="0"/>',
      '<metadata key="extruder" value="' + extruderIndex + '"/>',
      '<mesh_stat face_count="' + part.mesh.faces.length + '" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>',
      '</part>',
    ].join('')
  }).join('\n')
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<config>',
    '<object id="' + assemblyObjectId + '">',
    '<metadata key="name" value="' + xmlEscape(baseName) + '"/>',
    '<metadata key="extruder" value="' + (extruderPlan?.extruderByPartIndex?.[0] || 1) + '"/>',
    '<metadata face_count="' + totalFaceCount + '"/>',
    partXml,
    '</object>',
    '<plate>',
    '<metadata key="plater_id" value="1"/>',
    '<metadata key="plater_name" value=""/>',
    '<metadata key="locked" value="false"/>',
    '<metadata key="filament_map_mode" value="Auto For Flush"/>',
    '<metadata key="filament_maps" value="' + filamentSlotIndexes + '"/>',
    '<metadata key="filament_volume_maps" value="' + filamentVolumeMaps + '"/>',
    '<model_instance>',
    '<metadata key="object_id" value="' + assemblyObjectId + '"/>',
    '<metadata key="instance_id" value="0"/>',
    '<metadata key="identify_id" value="1"/>',
    '</model_instance>',
    '</plate>',
    '<assemble>',
    '<assemble_item object_id="' + assemblyObjectId + '" instance_id="0" transform="' + BAMBU_BUILD_TRANSFORM + '" offset="0 0 0" />',
    '</assemble>',
    '</config>',
  ].join('\n')
}

function isBambuProjectScalarArray(value) {
  return Array.isArray(value) && value.every((item) => (
    item === null
    || item === undefined
    || ['string', 'number', 'boolean'].includes(typeof item)
  ))
}

export function normalizeBambuStudioProjectSettings(settings = {}) {
  return Object.fromEntries(Object.entries(settings).map(([key, value]) => {
    if (!isBambuProjectScalarArray(value)) return [key, value]
    return [key, value.map((item) => String(item ?? ''))]
  }))
}

function buildBambuProjectSettings(printableParts, extruderPlan = null, filamentType = DEFAULT_FILAMENT_TYPE) {
  const profile = FILAMENT_PROFILES[filamentType] || FILAMENT_PROFILES[DEFAULT_FILAMENT_TYPE]
  const filamentParts = extruderPlan?.filamentColors?.length
    ? extruderPlan.filamentColors.map((displayColor) => ({ displayColor }))
    : printableParts
  const colors = filamentParts.map((part) => colorWithoutAlpha(part.displayColor))
  const filamentNames = filamentParts.map(() => profile.filamentSettingsId)
  const filamentIndexes = filamentParts.map((_, index) => String(index + 1))
  const filamentValues = (value) => filamentParts.map(() => String(value))
  const filamentVariantValues = (value) => filamentParts.flatMap(() => [String(value), String(value)])
  const filamentVariantIndexes = filamentParts.flatMap((_, index) => [
    String(index + 1),
    String(index + 1),
  ])
  const filamentExtruderVariants = filamentParts.flatMap(() => [
    'Direct Drive Standard',
    'Direct Drive High Flow',
  ])
  const flushMatrix = filamentParts.flatMap((_, rowIndex) => (
    filamentVariantIndexes.map((__, variantIndex) => rowIndex === Math.floor(variantIndex / 2) ? '0' : '280')
  ))
  const hasMultipleFilaments = filamentParts.length > 1
  const settings = {
    filament_colour: colors,
    default_filament_colour: colors,
    extruder_colour: ['#000000', '#000000'],
    filament_settings_id: filamentNames,
    filament_ids: filamentValues(profile.filamentId),
    filament_map: filamentValues('1'),
    filament_map_2: filamentValues('1'),
    filament_map_mode: 'Auto For Flush',
    filament_type: filamentValues(profile.filamentType),
    filament_vendor: filamentValues(profile.filamentVendor),
    filament_self_index: filamentVariantIndexes,
    filament_nozzle_map: filamentValues('0'),
    filament_volume_map: filamentValues('0'),
    filament_is_support: filamentValues('0'),
    filament_is_mixed: filamentValues('0'),
    filament_soluble: filamentValues('0'),
    filament_printable: filamentValues('1'),
    filament_diameter: filamentValues('1.75'),
    filament_density: filamentValues('1.24'),
    filament_cost: filamentValues('0'),
    filament_flow_ratio: filamentVariantValues(profile.flowRatio),
    filament_max_volumetric_speed: filamentVariantValues(profile.maxVolumetricSpeed),
    filament_start_gcode: filamentValues('; filament start gcode\n'),
    filament_end_gcode: filamentValues('; filament end gcode \n'),
    filament_change_length: filamentValues('4'),
    filament_change_length_nc: filamentValues('4'),
    filament_retract_length_nc: filamentVariantValues('0.4'),
    filament_ramming_travel_time: filamentVariantValues('0'),
    filament_ramming_travel_time_nc: filamentVariantValues('0'),
    filament_ramming_volumetric_speed: filamentVariantValues('0'),
    filament_ramming_volumetric_speed_nc: filamentVariantValues('0'),
    filament_prime_volume: filamentValues('45'),
    filament_prime_volume_nc: filamentValues('45'),
    filament_flush_temp: filamentVariantValues('0'),
    filament_flush_volumetric_speed: filamentVariantValues('0'),
    filament_pre_cooling_temperature: filamentVariantValues('0'),
    filament_pre_cooling_temperature_nc: filamentVariantValues('0'),
    filament_cooling_before_tower: filamentVariantValues('10'),
    filament_minimal_purge_on_wipe_tower: filamentValues('15'),
    filament_extruder_compatibility: filamentValues('0'),
    filament_extruder_variant: filamentExtruderVariants,
    filament_adaptive_volumetric_speed: filamentVariantValues('0'),
    filament_adhesiveness_category: filamentValues('0'),
    filament_enable_overhang_speed: filamentVariantValues('1'),
    filament_shrink: filamentValues('100%'),
    filament_notes: '',
    print_settings_id: BAMBU_H2C_PRINT_PROFILE.printSettingsId,
    printer_settings_id: BAMBU_H2C_PRINT_PROFILE.printerSettingsId,
    printer_model: BAMBU_H2C_PRINT_PROFILE.printerModel,
    printer_variant: BAMBU_H2C_PRINT_PROFILE.printerVariant,
    printer_technology: 'FFF',
    nozzle_diameter: BAMBU_H2C_NOZZLE_PROFILE.nozzleDiameter,
    nozzle_type: BAMBU_H2C_NOZZLE_PROFILE.nozzleType,
    nozzle_volume: BAMBU_H2C_NOZZLE_PROFILE.nozzleVolume,
    nozzle_volume_type: BAMBU_H2C_NOZZLE_PROFILE.nozzleVolumeType,
    default_nozzle_volume_type: BAMBU_H2C_NOZZLE_PROFILE.defaultNozzleVolumeType,
    nozzle_temperature: filamentVariantValues(profile.nozzleTemperature[0]),
    nozzle_temperature_initial_layer: filamentVariantValues(profile.nozzleTemperature[0]),
    nozzle_temperature_range_low: filamentValues('190'),
    nozzle_temperature_range_high: filamentValues('260'),
    curr_bed_type: profile.filamentType === 'PLA' ? 'Cool Plate' : 'Engineering Plate',
    printable_area: BAMBU_H2C_NOZZLE_PROFILE.printableArea,
    printable_height: BAMBU_H2C_NOZZLE_PROFILE.printableHeight,
    bed_exclude_area: ['0x0'],
    cool_plate_temp: filamentValues(profile.filamentType === 'PLA' ? '35' : '0'),
    cool_plate_temp_initial_layer: filamentValues(profile.filamentType === 'PLA' ? '35' : '0'),
    eng_plate_temp: filamentValues(profile.bedTemperature?.[0] || '55'),
    eng_plate_temp_initial_layer: filamentValues(profile.bedTemperature?.[0] || '55'),
    bed_temperature_formula: 'by_first_filament',
    extruder_clearance_height_to_rod: '47.4',
    extruder_clearance_height_to_lid: '201',
    extruder_clearance_max_radius: '96',
    extruder_clearance_dist_to_rod: '50',
    extruder_max_nozzle_count: BAMBU_H2C_NOZZLE_PROFILE.extruderMaxNozzleCount,
    extruder_type: BAMBU_H2C_NOZZLE_PROFILE.extruderType,
    extruder_offset: BAMBU_H2C_NOZZLE_PROFILE.extruderOffset,
    extruder_nozzle_stats: BAMBU_H2C_NOZZLE_PROFILE.extruderNozzleStats,
    extruder_variant_list: BAMBU_H2C_NOZZLE_PROFILE.extruderVariantList,
    extruder_printable_area: BAMBU_H2C_NOZZLE_PROFILE.extruderPrintableArea,
    extruder_printable_height: BAMBU_H2C_NOZZLE_PROFILE.extruderPrintableHeight,
    printer_extruder_id: BAMBU_H2C_NOZZLE_PROFILE.printerExtruderId,
    printer_extruder_variant: BAMBU_H2C_NOZZLE_PROFILE.printerExtruderVariant,
    print_extruder_id: BAMBU_H2C_NOZZLE_PROFILE.printerExtruderId,
    print_extruder_variant: BAMBU_H2C_NOZZLE_PROFILE.printerExtruderVariant,
    print_compatible_printers: BAMBU_H2C_NOZZLE_PROFILE.printCompatiblePrinters,
    upward_compatible_machine: BAMBU_H2C_NOZZLE_PROFILE.upwardCompatibleMachine,
    physical_extruder_map: BAMBU_H2C_NOZZLE_PROFILE.physicalExtruderMap,
    printer_structure: 'corexy',
    enable_prime_tower: hasMultipleFilaments ? '1' : '0',
    prime_tower_width: '60',
    prime_tower_brim_width: '-1',
    wipe_tower_x: ['165', '165'],
    wipe_tower_y: ['235.201', '235.201'],
    flush_multiplier: ['1', '1'],
    flush_volumes_matrix: flushMatrix,
    flush_volumes_vector: filamentVariantValues('140'),
    nozzle_flush_dataset: ['1', '2', '1', '2'],
    prime_volume_mode: 'Default',
    flush_into_infill: '0',
    flush_into_objects: '0',
    flush_into_support: '1',
    long_retractions_when_cut: filamentValues('1'),
    enable_long_retraction_when_cut: '2',
    single_extruder_multi_material: '1',
    enable_support: '0',
    support_filament: '0',
    support_interface_filament: '0',
    wall_filament: '0',
    sparse_infill_filament: '0',
    solid_infill_filament: '0',
    bottom_shell_layers: '3',
    top_shell_layers: '3',
    sparse_infill_density: '15%',
    sparse_infill_pattern: 'grid',
    layer_height: '0.2',
    initial_layer_print_height: '0.2',
    line_width: '0.42',
    outer_wall_line_width: '0.42',
    inner_wall_line_width: '0.45',
    top_surface_line_width: '0.42',
    internal_solid_infill_line_width: '0.45',
    sparse_infill_line_width: '0.45',
    brim_type: 'auto_brim',
    brim_width: '0',
    print_sequence: 'by layer',
    reduce_infill_retraction: '1',
    independent_support_layer_height: '1',
    enable_arc_fitting: '1',
    detect_thin_wall: '0',
    ensure_vertical_shell_thickness: 'enabled',
    machine_start_gcode: 'G28 ; home all axes\nG1 Z5 F5000 ; lift nozzle\n',
    machine_end_gcode: 'M104 S0 ; turn off temperature\nG28 X0  ; home X axis\nM84     ; disable motors\n',
    before_layer_change_gcode: '',
    change_filament_gcode: '',
    post_process: [],
  }
  return JSON.stringify(normalizeBambuStudioProjectSettings(settings), null, 4)
}

function buildBambuSliceInfoConfig(baseName, printableParts, extruderPlan = null) {
  const filamentColors = extruderPlan?.filamentColors?.length
    ? extruderPlan.filamentColors
    : printableParts.map((part) => colorWithoutAlpha(part.displayColor))
  const filaments = filamentColors.map((color, index) => (
    '<filament id="' + (index + 1) + '" tray_info_idx="' + BAMBU_H2C_PRINT_PROFILE.filamentId + '" type="' + BAMBU_H2C_PRINT_PROFILE.filamentType + '" color="' + xmlEscape(color) + '" used_m="0" used_g="0" />'
  ))
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<config>',
    '<header>',
    '<header_item key="X-BBL-Client-Type" value="slicer"/>',
    '<header_item key="X-BBL-Client-Version" value="' + xmlEscape(BAMBU_H2C_PRINT_PROFILE.clientVersion) + '"/>',
    '</header>',
    '<plate>',
    '<metadata key="index" value="1"/>',
    '<metadata key="printer_model_id" value="' + xmlEscape(BAMBU_H2C_PRINT_PROFILE.printerModelId) + '"/>',
    '<metadata key="nozzle_diameters" value="' + xmlEscape(BAMBU_H2C_PRINT_PROFILE.printerVariant) + '"/>',
    '<metadata key="timelapse_type" value="0"/>',
    '<metadata key="prediction" value="0"/>',
    '<metadata key="weight" value="0"/>',
    '<metadata key="outside" value="false"/>',
    '<metadata key="support_used" value="false"/>',
    '<metadata key="label_object_enabled" value="false"/>',
    '<object identify_id="1" name="' + xmlEscape(baseName) + '" skipped="false" />',
    ...filaments,
    '</plate>',
    '</config>',
  ].join('\n')
}

function buildBambuGeometryStrategy(model = {}) {
  return {
    colorBodies: 'anchored-to-base',
    layerLockOverlapMm: round(PRINT_LAYER_LOCK_OVERLAP_MM, 2),
    surfaceOverlays: 'raised-parts-embedded-into-print-body',
    route: model.route?.printGeometry || null,
  }
}

function buildBambuPrintHandoff(baseName, package3mf, parts, model = {}, packagePlan = null) {
  const printableParts = parts.filter((part) => part.mesh?.faces?.length)
  const extruderPlan = getBambuExtruderPlan(printableParts)
  const partAssignments = printableParts.map((part, index) => {
    const slot = extruderPlan.extruderByPartIndex[index] || index + 1
    return {
      key: part.key,
      name: part.threeMfName,
      file: part.file,
      color: colorWithoutAlpha(part.displayColor),
      slot,
    }
  })
  const materialSlots = extruderPlan.filamentColors.map((color, index) => {
    const slot = index + 1
    return {
      slot,
      color,
      filamentId: BAMBU_H2C_PRINT_PROFILE.filamentId,
      filamentType: BAMBU_H2C_PRINT_PROFILE.filamentType,
      filamentVendor: BAMBU_H2C_PRINT_PROFILE.filamentVendor,
      filamentSettingsId: BAMBU_H2C_PRINT_PROFILE.filamentSettingsId,
      parts: partAssignments
        .filter((assignment) => assignment.slot === slot)
        .map((assignment) => assignment.name),
    }
  })
  return {
    package3mf,
    guideFile: baseName + '-bambu-print-guide.txt',
    workflow: 'bambu-orca-3mf-object-extruder-colors',
    printerProfile: {
      printerSettingsId: BAMBU_H2C_PRINT_PROFILE.printerSettingsId,
      printerModel: BAMBU_H2C_PRINT_PROFILE.printerModel,
      printerModelId: BAMBU_H2C_PRINT_PROFILE.printerModelId,
      printerVariant: BAMBU_H2C_PRINT_PROFILE.printerVariant,
      nozzleDiameterMm: Number(BAMBU_H2C_PRINT_PROFILE.printerVariant),
      printSettingsId: BAMBU_H2C_PRINT_PROFILE.printSettingsId,
      filamentSettingsId: BAMBU_H2C_PRINT_PROFILE.filamentSettingsId,
      filamentId: BAMBU_H2C_PRINT_PROFILE.filamentId,
      filamentType: BAMBU_H2C_PRINT_PROFILE.filamentType,
      filamentVendor: BAMBU_H2C_PRINT_PROFILE.filamentVendor,
    },
    materialSlotCount: materialSlots.length,
    materialSlots,
    partAssignments,
    geometryBudget: packagePlan?.geometryBudget || buildBambuSlicerPackagePlan(printableParts, []).geometryBudget,
    omittedDynamicColorParts: packagePlan?.omittedDynamicColorParts || [],
    geometryStrategy: buildBambuGeometryStrategy(model),
  }
}

function preflightStatusFromReadinessStatus(status) {
  if (status === 'blocked') return 'blocked'
  if (status === 'review') return 'review'
  return 'ok'
}

function worstPreflightStatus(statuses) {
  if (statuses.includes('blocked')) return 'blocked'
  if (statuses.includes('review')) return 'review'
  return 'ok'
}

function getReadinessCheck(readiness, key) {
  return readiness?.checks?.find((check) => check.key === key) || null
}

function buildPreflightCheck(key, status, label, detail, shortDetail = null) {
  return {
    ...buildReadinessCheck(key, status, label, detail),
    ...(shortDetail ? { shortDetail } : {}),
  }
}

function formatBuildSize(stats = {}) {
  const width = pickNumber(stats.modelWidthMm, NaN)
  const depth = pickNumber(stats.modelDepthMm, NaN)
  const height = pickNumber(stats.maxHeightMm, 0) + pickNumber(stats.basePlateHeightMm, 0)
  if (![width, depth, height].every(Number.isFinite)) return '尺寸未知'
  return formatReadinessNumber(width, 1) + ' x ' + formatReadinessNumber(depth, 1) + ' x ' + formatReadinessNumber(height, 1) + ' mm'
}

function summarizeBambuMaterialSlots(materialSlots = []) {
  return materialSlots.map((slot) => (
    'Slot ' + slot.slot + ' ' + slot.color + ' -> ' + (slot.parts?.join(', ') || 'unused')
  )).join('; ')
}

function buildColorSeparationSummary(model = {}) {
  const lowland = model.colorBands?.lowland || {}
  const snowline = model.snowline || {}
  const contourCount = pickNumber(model.contours?.segmentCount, 0)
  const lowlandText = lowland.enabled
    ? '低地 ' + formatReadinessPercent(pickNumber(lowland.coverageRatio, NaN))
    : '低地关闭'
  const snowText = snowline.enabled
    ? '雪盖 ' + formatReadinessPercent(pickNumber(snowline.coverageRatio, NaN))
    : '雪线关闭'
  const contourText = model.contours?.enabled
    ? '等高线 ' + contourCount + ' 段'
    : '等高线关闭'
  return lowlandText + '；' + snowText + '；' + contourText + '。'
}

function buildPrintGeometrySummary(model = {}, handoff = null) {
  const route = handoff?.geometryStrategy?.route || model.route?.printGeometry || {}
  const stats = model.stats || {}
  const sourcePointCount = pickNumber(route.sourcePointCount, NaN)
  const printablePointCount = pickNumber(route.printablePointCount, NaN)
  const toleranceMm = pickNumber(route.simplifyToleranceMm, NaN)
  const reliefRatio = getReliefFootprintRatio(stats)
  const pointText = Number.isFinite(sourcePointCount) && Number.isFinite(printablePointCount)
    ? '轨迹点 ' + sourcePointCount + ' -> ' + printablePointCount
    : '轨迹点按打印尺度处理'
  const toleranceText = Number.isFinite(toleranceMm)
    ? '，容差 ' + formatReadinessNumber(toleranceMm, 2) + ' mm'
    : ''
  const overlapText = '彩色部件向下锁定 ' + formatReadinessNumber(PRINT_LAYER_LOCK_OVERLAP_MM, 2) + ' mm'
  const reliefText = Number.isFinite(reliefRatio) && reliefRatio > PRINT_READABLE_MAX_FOOTPRINT_RATIO
    ? ' 起伏/短边 ' + formatReadinessNumber(reliefRatio, 2)
      + '，高于建议 ' + formatReadinessNumber(PRINT_READABLE_MAX_FOOTPRINT_RATIO, 2)
      + '，建议调大成品尺寸或降低起伏后再切片。'
    : ''
  const omittedParts = handoff?.omittedDynamicColorParts || []
  const omittedText = omittedParts.length
    ? ' Bambu 切片包已省略 ' + omittedParts.length + ' 个高密度动态色带（'
      + omittedParts.map((part) => part.name).join(', ')
      + '），完整色带仍保留为独立 STL/通用 3MF，避免切片器处理 '
      + formatReadinessNumber(handoff.geometryBudget?.fullFaceCount, 0) + ' 个三角面。'
    : ''
  return overlapText + '，并落地锚定；' + pointText + toleranceText + '。' + omittedText + reliefText
}

function getReliefFootprintRatio(stats = {}) {
  const reliefMm = pickNumber(stats.reliefMm, NaN)
  const shortSide = Math.min(
    pickNumber(stats.terrainWidthMm ?? stats.modelWidthMm, NaN),
    pickNumber(stats.terrainDepthMm ?? stats.modelDepthMm, NaN),
  )
  if (!Number.isFinite(reliefMm) || !Number.isFinite(shortSide) || shortSide <= 0) return NaN
  return reliefMm / shortSide
}

function getPrintGeometryPreflightStatus(model = {}, handoff = null) {
  if (handoff?.omittedDynamicColorParts?.length) return 'review'
  const reliefRatio = getReliefFootprintRatio(model.stats || {})
  if (Number.isFinite(reliefRatio) && reliefRatio > PRINT_READABLE_MAX_FOOTPRINT_RATIO) return 'review'
  return 'ok'
}

export function buildTerrainPrintPreflight(model = {}, handoff = null, readinessInput = null, surfaceTextureExport = null) {
  const readiness = readinessInput || evaluateTerrainModelReadiness(model)
  const stats = model.stats || {}
  const materialSlots = Array.isArray(handoff?.materialSlots) ? handoff.materialSlots : []
  const reliefCheck = getReadinessCheck(readiness, 'relief-scale')
  const colorChecks = [
    getReadinessCheck(readiness, 'print-colors'),
    getReadinessCheck(readiness, 'snowline'),
  ].filter(Boolean)
  const buildSize = formatBuildSize(stats)
  const maxPlanarSize = Math.max(
    pickNumber(stats.modelWidthMm, NaN),
    pickNumber(stats.modelDepthMm, NaN),
  )
  const totalHeight = pickNumber(stats.maxHeightMm, 0) + pickNumber(stats.basePlateHeightMm, 0)
  const hasBuildSize = Number.isFinite(maxPlanarSize) && Number.isFinite(totalHeight)
  const buildSizeStatus = !hasBuildSize || maxPlanarSize > 300 || totalHeight > 300 ? 'review' : 'ok'
  const productionDetail = readiness.warnings?.length
    ? readiness.label + '：' + readiness.warnings.length + ' 项需处理，先看页面生产检查。'
    : readiness.label + '：DEM、表面精度、起伏、分色和部件检查已通过。'

  const checks = [
    buildPreflightCheck(
      'production-readiness',
      preflightStatusFromReadinessStatus(readiness.status),
      '生产检查',
      productionDetail,
    ),
    buildPreflightCheck(
      'bambu-package',
      handoff?.package3mf ? 'ok' : 'blocked',
      '拓竹项目',
      handoff?.package3mf
        ? '优先打开 ' + handoff.package3mf + '，保留已装配对象和槽位映射。'
        : '未生成拓竹 3MF，不能直接交给 Bambu Studio。',
    ),
    buildPreflightCheck(
      'material-slots',
      materialSlots.length ? 'ok' : 'blocked',
      '耗材槽',
      materialSlots.length
        ? materialSlots.length + ' 个槽位：' + summarizeBambuMaterialSlots(materialSlots) + '。'
        : '缺少耗材槽映射，打开切片软件后会丢失分色。',
      materialSlots.length
        ? materialSlots.length + ' 个槽位，颜色和部件映射见下方耗材槽。'
        : '缺少耗材槽映射。',
    ),
    buildPreflightCheck(
      'build-size',
      buildSizeStatus,
      '成品尺寸',
      hasBuildSize
        ? '成品约 ' + buildSize + '；拓竹切片前确认没有超出机器平台。'
        : '缺少成品宽深或高度尺寸；拓竹切片前需要先确认模型没有超出机器平台。',
    ),
    buildPreflightCheck(
      'relief-scale',
      reliefCheck?.status || 'review',
      '起伏倍率',
      reliefCheck?.detail || (
        '模型起伏 ' + formatReadinessNumber(pickNumber(stats.reliefMm, NaN)) + ' mm，垂直倍率 '
          + formatReadinessNumber(pickNumber(stats.verticalExaggeration, NaN)) + 'x。'
      ),
    ),
    buildPreflightCheck(
      'color-separation',
      worstPreflightStatus(colorChecks.map((check) => check.status)),
      '分色结构',
      buildColorSeparationSummary(model),
    ),
    buildPreflightCheck(
      'print-geometry',
      getPrintGeometryPreflightStatus(model, handoff),
      '切片几何',
      buildPrintGeometrySummary(model, handoff),
      '彩色部件已落地锚定，轨迹已按打印尺度简化。',
    ),
    buildPreflightCheck(
      'surface-texture',
      'ok',
      '卫星贴图',
      surfaceTextureExport
        ? '已导出贴图文件；卫星贴图只用于 GLB/通用 3MF 预览，FDM 彩色打印以几何分件和耗材槽为准。'
        : '未导出贴图文件；FDM 彩色打印以几何分件和耗材槽为准。',
    ),
  ]
  const status = getOverallReadinessStatus(checks)

  return {
    version: 1,
    status,
    label: getReadinessLabel(status),
    package3mf: handoff?.package3mf || null,
    guideFile: handoff?.guideFile || null,
    checks,
    warnings: checks.filter((check) => check.status !== 'ok'),
  }
}

function getBambuPreflightGuideLabel(key, fallback) {
  return {
    'production-readiness': 'Production readiness',
    'bambu-package': 'Bambu package',
    'material-slots': 'Material slots',
    'build-size': 'Build size',
    'relief-scale': 'Relief scale',
    'color-separation': 'Color separation',
    'print-geometry': 'Print geometry',
    'surface-texture': 'Surface texture',
  }[key] || fallback
}

function buildBambuPrintGuideText(handoff) {
  const slotLines = handoff.materialSlots.map((slot) => (
    'Slot ' + slot.slot + ': ' + slot.color + ' ' + slot.filamentSettingsId + ' -> ' + (slot.parts.join(', ') || 'unused')
  ))
  const partLines = handoff.partAssignments.map((assignment) => (
    assignment.name + ': slot ' + assignment.slot + ' (' + assignment.color + ')'
  ))
  const preflightLines = handoff.preflight?.checks?.length
    ? [
      'Print preflight',
      'Status: ' + handoff.preflight.label + ' (' + handoff.preflight.status + ')',
      ...handoff.preflight.checks.map((check) => (
        getBambuPreflightGuideLabel(check.key, check.label) + ': [' + check.status.toUpperCase() + '] ' + check.detail
      )),
      '',
    ]
    : []
  return [
    'Bambu Studio color print guide',
    '',
    'Open: ' + handoff.package3mf,
    'Printer: ' + handoff.printerProfile.printerSettingsId,
    'Process: ' + handoff.printerProfile.printSettingsId,
    'Material: ' + handoff.printerProfile.filamentSettingsId,
    '',
    'AMS / filament slots',
    ...slotLines,
    '',
    ...preflightLines,
    'Part assignments',
    ...partLines,
    '',
    'Notes',
    '- Keep the imported parts assembled.',
    '- The Bambu 3MF uses grounded color bodies with a ' + formatReadinessNumber(PRINT_LAYER_LOCK_OVERLAP_MM, 2) + ' mm layer lock overlap so red route, snow, lowland and labels are printable material solids, not floating surface decals.',
    '- The route ribbon is simplified at print scale before export to avoid dense GPX points producing slicer cantilever warnings.',
    '- Surface texture files are preview-only. FDM print colors come from geometry parts and filament slots.',
    '- If Bambu Studio asks to remap materials, match the slot colors and part names above.',
    '',
  ].join('\n')
}

function buildBambuThreeMfPackage(model, baseName, parts, options = {}) {
  const printableParts = parts.filter((part) => part.mesh?.faces?.length)
  const extruderPlan = getBambuExtruderPlan(printableParts)
  const verticalOffsetMm = pickNumber(options.verticalOffsetMm, 0)
  const zip = new PizZip()
  zip.file('[Content_Types].xml', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>',
    '<Default Extension="config" ContentType="text/xml"/>',
    '<Default Extension="json" ContentType="application/json"/>',
    '</Types>',
  ].join('\n'))
  zip.file('_rels/.rels', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>',
    '</Relationships>',
  ].join('\n'))
  zip.file('3D/3dmodel.model', buildBambuRootModel(baseName, printableParts))
  zip.file('3D/_rels/3dmodel.model.rels', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ...printableParts.map((_, index) => (
      '<Relationship Target="/3D/Objects/object_' + (index + 1) + '.model" Id="rel-' + (index + 1) + '" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
    )),
    '</Relationships>',
  ].join('\n'))
  printableParts.forEach((part, index) => {
    const objectId = index + 1
    zip.file('3D/Objects/object_' + (index + 1) + '.model', meshToBambuObjectModel(part.mesh, objectId, part.threeMfName, verticalOffsetMm))
  })
  zip.file('Metadata/model_settings.config', buildBambuModelSettings(baseName, printableParts, extruderPlan))
  zip.file('Metadata/project_settings.config', buildBambuProjectSettings(printableParts, extruderPlan, model?.print?.filamentType))
  zip.file('Metadata/slice_info.config', buildBambuSliceInfoConfig(baseName, printableParts, extruderPlan))
  zip.file('Metadata/filament_sequence.json', '{"plate_1":{"nozzle_sequence":[],"optimal_assignment":[],"sequence":[]}}')
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' })
}

function buildThreeMfPackage(model, baseName, parts, options = {}) {
  const printableParts = parts.filter((part) => part.mesh?.faces?.length)
  const verticalOffsetMm = pickNumber(options.verticalOffsetMm, 0)
  const surfaceTextureExport = options.surfaceTextureExport
  const textureEmbeddingEnabled = isThreeMfEmbeddableTexture(surfaceTextureExport)
  const materialGroupId = 100
  const textureResourceId = 101
  const textureGroupId = 102
  const texturePath = textureEmbeddingEnabled ? getThreeMfTexturePath(surfaceTextureExport.file) : null
  const textureContentType = textureEmbeddingEnabled ? threeMfTextureContentType(surfaceTextureExport.file.mimeType) : null
  const materialXml = printableParts.map((part) => (
    '<m:base name="' + xmlEscape(part.threeMfName) + '" displaycolor="' + part.displayColor + '"/>'
  )).join('')
  const objectResults = printableParts.map((part, index) => (
    meshToThreeMfObject(part.mesh, index + 1, part.threeMfName, index, verticalOffsetMm, {
      materialGroupId,
      textureGroupId: textureEmbeddingEnabled && part.key === 'terrain' ? textureGroupId : null,
      textureDimensions: textureEmbeddingEnabled && part.key === 'terrain' ? model.stats : null,
    })
  ))
  const textureCoordinateXml = objectResults.find((result) => result.textureCoords)?.textureCoords || ''
  const textureResourceXml = textureEmbeddingEnabled && textureCoordinateXml
    ? [
      '<m:texture2d id="' + textureResourceId + '" path="' + xmlEscape(texturePath) + '" contenttype="' + textureContentType + '" tilestyleu="clamp" tilestylev="clamp" filter="linear"/>',
      '<m:texture2dgroup id="' + textureGroupId + '" texid="' + textureResourceId + '">' + textureCoordinateXml + '</m:texture2dgroup>',
    ].join('\n')
    : ''
  const objectXml = objectResults.map((result) => result.objectXml).join('')
  const buildXml = printableParts.map((_, index) => (
    '<item objectid="' + (index + 1) + '"/>'
  )).join('')
  const modelXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">',
    '<metadata name="Title">' + xmlEscape(baseName) + '</metadata>',
    '<resources>',
    '<m:basematerials id="' + materialGroupId + '">' + materialXml + '</m:basematerials>',
    textureResourceXml,
    objectXml,
    '</resources>',
    '<build>' + buildXml + '</build>',
    '</model>',
  ].filter(Boolean).join('\n')
  const zip = new PizZip()
  const textureExtension = textureEmbeddingEnabled ? String(surfaceTextureExport.file.name).split('.').pop() : ''
  zip.file('[Content_Types].xml', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>',
    textureEmbeddingEnabled && textureExtension
      ? '<Default Extension="' + xmlEscape(textureExtension) + '" ContentType="' + textureContentType + '"/>'
      : '',
    '</Types>',
  ].filter(Boolean).join('\n'))
  zip.file('_rels/.rels', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>',
    '</Relationships>',
  ].join('\n'))
  zip.file('3D/3dmodel.model', modelXml)
  if (textureEmbeddingEnabled && texturePath && textureCoordinateXml) {
    zip.file(texturePath.replace(/^\//, ''), surfaceTextureExport.file.content)
  }
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' })
}

export function validateTerrainModelExport(model) {
  const meshes = Object.fromEntries(Object.entries(model.meshes || {}).map(([key, mesh]) => {
    const errors = []
    if (!Array.isArray(mesh?.vertices)) errors.push('vertices missing')
    if (!Array.isArray(mesh?.faces)) errors.push('faces missing')
    ;(mesh?.faces || []).forEach((face, faceIndex) => {
      if (!Array.isArray(face) || face.length !== 3) {
        errors.push(`face ${faceIndex} is not a triangle`)
        return
      }
      face.forEach((index) => {
        if (!Number.isInteger(index) || index < 0 || index >= mesh.vertices.length) {
          errors.push(`face index ${index} is out of range`)
        }
      })
    })
    return [key, { valid: errors.length === 0, errors }]
  }))
  return {
    valid: Object.values(meshes).every((mesh) => mesh.valid),
    meshes,
  }
}

function countMeshFaces(mesh) {
  return Array.isArray(mesh?.faces) ? mesh.faces.length : 0
}

const BAMBU_SLICER_SAFE_FACE_BUDGET = 1_200_000

function sumPartFaces(parts = []) {
  return parts.reduce((total, part) => total + countMeshFaces(part.mesh), 0)
}

function summarizeOmittedBambuPart(part) {
  return {
    key: part.key,
    name: part.threeMfName,
    file: part.file,
    color: part.color,
    faceCount: countMeshFaces(part.mesh),
  }
}

function buildBambuSlicerPackagePlan(allParts = [], dynamicColorParts = []) {
  const fullFaceCount = sumPartFaces(allParts)
  const dynamicKeys = new Set(dynamicColorParts.map((part) => part.key))
  const shouldOmitDynamicColorParts = dynamicColorParts.length > 0 && fullFaceCount > BAMBU_SLICER_SAFE_FACE_BUDGET
  const packageParts = shouldOmitDynamicColorParts
    ? allParts.filter((part) => !dynamicKeys.has(part.key))
    : allParts
  const omittedDynamicColorParts = shouldOmitDynamicColorParts
    ? dynamicColorParts.map(summarizeOmittedBambuPart)
    : []
  const packageFaceCount = sumPartFaces(packageParts)
  return {
    parts: packageParts,
    omittedDynamicColorParts,
    geometryBudget: {
      faceBudget: BAMBU_SLICER_SAFE_FACE_BUDGET,
      fullFaceCount,
      packageFaceCount,
      omittedFaceCount: fullFaceCount - packageFaceCount,
      policy: shouldOmitDynamicColorParts ? 'omit-dense-dynamic-color-bands' : 'keep-all-print-parts',
    },
  }
}

function formatReadinessNumber(value, digits = 2) {
  return Number.isFinite(value) ? String(round(value, digits)) : '-'
}

function formatReadinessPercent(ratio) {
  return Number.isFinite(ratio) ? formatReadinessNumber(ratio * 100, 1) + '%' : '-'
}

function buildReadinessCheck(key, status, label, detail) {
  return { key, status, label, detail }
}

function getOverallReadinessStatus(checks) {
  if (checks.some((check) => check.status === 'blocked')) return 'blocked'
  if (checks.some((check) => check.status === 'review')) return 'review'
  return 'ready'
}

function getReadinessLabel(status) {
  if (status === 'blocked') return '不建议打印'
  if (status === 'review') return '需复核'
  return '可打印'
}

function hasGpxOnlyElevation(model) {
  const sourceType = model?.terrain?.precision?.source?.type
  const terrainSource = model?.terrain?.source
  return sourceType === 'gpx-elevation' || terrainSource === 'gpx-elevation'
}

function getQualityRatio(quality, key) {
  const totalCount = pickNumber(quality?.totalCount, 0)
  if (totalCount <= 0) return null
  return pickNumber(quality?.[key], 0) / totalCount
}

export function evaluateTerrainModelReadiness(model = {}) {
  const terrain = model.terrain || {}
  const precision = terrain.precision || {}
  const quality = terrain.quality || {}
  const stats = model.stats || {}
  const meshes = model.meshes || {}
  const checks = []

  const totalSamples = pickNumber(quality.totalCount ?? precision.sampleCount, 0)
  const validSamples = pickNumber(quality.validSampleCount, 0)
  const fallbackRatio = getQualityRatio(quality, 'fallbackCount')
  const invalidRatio = getQualityRatio(quality, 'invalidCount')
  const sourceName = precision.source?.name || terrain.source || '未知来源'

  if (hasGpxOnlyElevation(model)) {
    checks.push(buildReadinessCheck(
      'dem-coverage',
      'review',
      'DEM 覆盖',
      '当前只使用 GPX 自带高程，适合草稿预览；成品建议先获取 OpenTopography/COP30 等 DEM。',
    ))
  } else if (totalSamples > 0 && validSamples <= 0) {
    checks.push(buildReadinessCheck(
      'dem-coverage',
      'blocked',
      'DEM 覆盖',
      'DEM 采样没有有效高程，模型由回退数据补齐，不建议直接打印。',
    ))
  } else if (Number.isFinite(fallbackRatio) && fallbackRatio > 0.35) {
    checks.push(buildReadinessCheck(
      'dem-coverage',
      'blocked',
      'DEM 覆盖',
      'DEM 回退比例 ' + formatReadinessPercent(fallbackRatio) + '，超过 35%，地形表面不可靠。',
    ))
  } else if (Number.isFinite(fallbackRatio) && fallbackRatio > 0.05) {
    checks.push(buildReadinessCheck(
      'dem-coverage',
      'review',
      'DEM 覆盖',
      'DEM 回退比例 ' + formatReadinessPercent(fallbackRatio) + '，需要检查是否有孔洞或海拔异常。',
    ))
  } else {
    const invalidText = Number.isFinite(invalidRatio) && invalidRatio > 0
      ? '，已剔除异常点 ' + formatReadinessPercent(invalidRatio)
      : ''
    checks.push(buildReadinessCheck(
      'dem-coverage',
      'ok',
      'DEM 覆盖',
      sourceName + ' 有效采样可用' + invalidText + '。',
    ))
  }

  const gridSpacingMm = [
    precision.gridSpacingMm?.x,
    precision.gridSpacingMm?.z,
  ].map((value) => pickNumber(value, NaN)).filter(Number.isFinite)
  const maxGridSpacingMm = gridSpacingMm.length ? Math.max(...gridSpacingMm) : NaN
  const sourceResolutionMeters = pickNumber(precision.source?.resolutionMeters, NaN)
  if (!Number.isFinite(maxGridSpacingMm)) {
    checks.push(buildReadinessCheck(
      'surface-resolution',
      'review',
      '表面精度',
      '缺少模型网格间距，导出前需要确认采样密度。',
    ))
  } else if (maxGridSpacingMm <= 0.55) {
    const sourceText = Number.isFinite(sourceResolutionMeters)
      ? '，DEM ' + formatReadinessNumber(sourceResolutionMeters) + ' m'
      : ''
    checks.push(buildReadinessCheck(
      'surface-resolution',
      'ok',
      '表面精度',
      '模型网格最大间距 ' + formatReadinessNumber(maxGridSpacingMm) + ' mm，接近 0.4 喷嘴的可读精度' + sourceText + '。',
    ))
  } else if (maxGridSpacingMm <= 0.8) {
    checks.push(buildReadinessCheck(
      'surface-resolution',
      'review',
      '表面精度',
      '模型网格最大间距 ' + formatReadinessNumber(maxGridSpacingMm) + ' mm，可打印但细沟谷会被简化。',
    ))
  } else {
    checks.push(buildReadinessCheck(
      'surface-resolution',
      'review',
      '表面精度',
      '模型网格最大间距 ' + formatReadinessNumber(maxGridSpacingMm) + ' mm，建议提高网格或缩小成品尺寸。',
    ))
  }

  const reliefMm = pickNumber(stats.reliefMm, NaN)
  const verticalExaggeration = pickNumber(stats.verticalExaggeration, NaN)
  if (!Number.isFinite(reliefMm) || reliefMm <= 0) {
    checks.push(buildReadinessCheck(
      'relief-scale',
      'blocked',
      '起伏倍率',
      '模型没有有效起伏，打印后无法读出地形。',
    ))
  } else if (reliefMm < 10) {
    checks.push(buildReadinessCheck(
      'relief-scale',
      'review',
      '起伏倍率',
      '模型起伏 ' + formatReadinessNumber(reliefMm) + ' mm，成品可能偏扁。',
    ))
  } else if (verticalExaggeration > 6) {
    checks.push(buildReadinessCheck(
      'relief-scale',
      'review',
      '起伏倍率',
      '垂直夸张 ' + formatReadinessNumber(verticalExaggeration) + 'x，地形会比真实比例明显陡峭。',
    ))
  } else if (reliefMm > 28) {
    checks.push(buildReadinessCheck(
      'relief-scale',
      'review',
      '起伏倍率',
      '模型起伏 ' + formatReadinessNumber(reliefMm) + ' mm，切片前需要确认坡面和支撑风险。',
    ))
  } else {
    checks.push(buildReadinessCheck(
      'relief-scale',
      'ok',
      '起伏倍率',
      '模型起伏 ' + formatReadinessNumber(reliefMm) + ' mm，垂直倍率 ' + formatReadinessNumber(verticalExaggeration) + 'x。',
    ))
  }

  const lowland = model.colorBands?.lowland || {}
  const lowlandCoverage = pickNumber(lowland.coverageRatio, NaN)
  const bandCount = (model.colorBands?.elevationBands?.bandCount || 0)
    + (model.colorBands?.satelliteBands?.bandCount || 0)
  const hasMultiBands = bandCount > 0

  if (hasMultiBands) {
    // Count total unique part colours to check against H2C 6-slot limit
    const allParts = []
    ;(model.meshes.elevationBands || []).forEach((m) => m.faces?.length && allParts.push(m))
    ;(model.meshes.satelliteBands || []).forEach((m) => m.faces?.length && allParts.push(m))
    if (meshes.terrain?.faces?.length) allParts.push(meshes.terrain)
    if (meshes.track?.faces?.length) allParts.push(meshes.track)
    if (meshes.contours?.faces?.length) allParts.push(meshes.contours)
    if (meshes.snowline?.faces?.length) allParts.push(meshes.snowline)
    if (meshes.snow?.faces?.length) allParts.push(meshes.snow)
    if (meshes.base?.faces?.length) allParts.push(meshes.base)
    const totalParts = allParts.length
    // Estimate unique colours ≈ bands + terrain + track + base + (white shard)
    const estimatedUniqueColors = bandCount + 4 + (meshes.contours?.faces?.length || meshes.snow?.faces?.length ? 1 : 0)
    const status = estimatedUniqueColors > 6 ? 'review' : 'ok'
    const note = estimatedUniqueColors > 6
      ? ' ⚠ 总颜色约 ' + estimatedUniqueColors + ' 种，超过 H2C 6 槽上限，多余色会就近合并。建议减少色带或关闭雪线/等高线。'
      : ''
    checks.push(buildReadinessCheck(
      'print-colors',
      status,
      '地形分色',
      '已生成 ' + bandCount + ' 条色带（共 ' + totalParts + ' 个实体）' + note,
    ))
  } else if (!lowland.enabled || countMeshFaces(meshes.lowland) <= 0) {
    checks.push(buildReadinessCheck(
      'print-colors',
      'review',
      '地形分色',
      '低地/荒地没有独立实体，打印时只会得到单一地形色。',
    ))
  } else if (lowlandCoverage < 0.12 || lowlandCoverage > 0.62) {
    checks.push(buildReadinessCheck(
      'print-colors',
      'review',
      '地形分色',
      '低地实体覆盖 ' + formatReadinessPercent(lowlandCoverage) + '，建议复核分色阈值。',
    ))
  } else {
    checks.push(buildReadinessCheck(
      'print-colors',
      'ok',
      '地形分色',
      '低地实体覆盖 ' + formatReadinessPercent(lowlandCoverage) + '，可作为绿色材料打印。',
    ))
  }

  const snowline = model.snowline || {}
  const snowCoverage = pickNumber(snowline.coverageRatio, NaN)
  const shouldHaveSnow = pickNumber(terrain.maxElevationMeters, 0) >= 1800
    && pickNumber(stats.elevationGainMeters, 0) >= 250
  if (snowline.enabled && countMeshFaces(meshes.snow) > 0) {
    if (snowCoverage > 0.55 || snowCoverage < 0.03) {
      checks.push(buildReadinessCheck(
        'snowline',
        'review',
        '雪线/高区',
        '雪盖覆盖 ' + formatReadinessPercent(snowCoverage) + '，建议复核雪线阈值。',
      ))
    } else {
      checks.push(buildReadinessCheck(
        'snowline',
        'ok',
        '雪线/高区',
        '雪盖覆盖 ' + formatReadinessPercent(snowCoverage) + '，白色实体可单独打印。',
      ))
    }
  } else if (shouldHaveSnow) {
    checks.push(buildReadinessCheck(
      'snowline',
      'review',
      '雪线/高区',
      '高海拔路线未生成雪线/雪盖，成品层次会弱。',
    ))
  } else {
    checks.push(buildReadinessCheck(
      'snowline',
      'ok',
      '雪线/高区',
      '当前路线不强制需要雪线实体。',
    ))
  }

  const printableParts = [
    ['terrain', countMeshFaces(meshes.terrain)],
    ['track', countMeshFaces(meshes.track)],
    ['base', countMeshFaces(meshes.base)],
    ['label', countMeshFaces(meshes.text)],
    ['snow', countMeshFaces(meshes.snow)],
    ['lowland', countMeshFaces(meshes.lowland)],
  ].filter(([, faceCount]) => faceCount > 0).map(([key]) => key)
  if (countMeshFaces(meshes.terrain) <= 0 || countMeshFaces(meshes.track) <= 0) {
    checks.push(buildReadinessCheck(
      'print-parts',
      'blocked',
      '打印部件',
      '地形或轨迹实体缺失，无法形成完整赛事纪念模型。',
    ))
  } else if (!model.print?.enabled || countMeshFaces(meshes.base) <= 0) {
    checks.push(buildReadinessCheck(
      'print-parts',
      'review',
      '打印部件',
      '缺少底座/多部件打印包，建议使用六边形底座或框架后再交付。',
    ))
  } else {
    checks.push(buildReadinessCheck(
      'print-parts',
      'ok',
      '打印部件',
      '已拆分 ' + printableParts.length + ' 类可打印实体：' + printableParts.join(', ') + '。',
    ))
  }

  const status = getOverallReadinessStatus(checks)
  return {
    status,
    label: getReadinessLabel(status),
    checks,
    warnings: checks.filter((check) => check.status !== 'ok'),
  }
}

export function toAsciiSafeExportBaseName(value) {
  return toSharedAsciiSafeExportBaseName(value, 'door-terrain-model')
}

function extensionForTextureMimeType(mimeType) {
  if (/png/i.test(mimeType)) return 'png'
  if (/webp/i.test(mimeType)) return 'webp'
  if (/jpe?g/i.test(mimeType)) return 'jpg'
  return 'jpg'
}

function decodeBase64ToBytes(base64) {
  const normalized = String(base64 || '').replace(/\s+/g, '')
  if (!normalized) return null
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(normalized)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  }
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(normalized, 'base64'))
  }
  throw new Error('当前环境无法解码卫星贴图')
}

function buildSurfaceTextureExport(baseName, surfaceTexture) {
  if (!surfaceTexture?.imageUrl) return null
  const match = String(surfaceTexture.imageUrl).match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/)
  if (!match || !match[2]) {
    throw new Error('卫星贴图导出需要 base64 data URL')
  }
  const mimeType = surfaceTexture.mimeType || match[1] || 'image/jpeg'
  const extension = extensionForTextureMimeType(mimeType)
  const fileName = baseName + '-surface-texture.' + extension
  const content = decodeBase64ToBytes(match[3])
  if (!content?.length) {
    throw new Error('卫星贴图导出数据为空')
  }

  return {
    file: {
      name: fileName,
      mimeType,
      content,
    },
    manifest: {
      enabled: true,
      file: fileName,
      mimeType,
      source: surfaceTexture.source ? {
        key: surfaceTexture.source.key,
        name: surfaceTexture.source.name,
        attribution: surfaceTexture.source.attribution,
        kind: surfaceTexture.source.kind,
      } : null,
      zoom: surfaceTexture.zoom,
      tileCount: surfaceTexture.tileCount,
      dimensions: {
        width: surfaceTexture.textureWidth,
        height: surfaceTexture.textureHeight,
      },
      bounds: surfaceTexture.bounds,
      coverageBounds: surfaceTexture.coverageBounds,
      generatedAt: surfaceTexture.generatedAt,
    },
  }
}

// Builds the export file *descriptors* (name + mimeType + a lazy `build()`
// thunk) plus the manifest. The expensive work — ASCII STL serialization of
// every mesh and two DEFLATE-compressed 3MF packages — lives inside `build()`
// and only runs when a caller actually materializes a file (i.e. on download).
// The manifest itself is cheap metadata, so it is fully computed here and is
// available to the UI (file list, Bambu hand-off) without touching geometry.
function buildExportFileSpecs(model, options = {}) {
  const originalBaseName = String(options.baseName || 'door-terrain-model').trim() || 'door-terrain-model'
  const filenamePolicy = buildExportFilenamePolicy(originalBaseName, { fallback: 'door-terrain-model' })
  const baseName = filenamePolicy.baseName
  const printKitEnabled = Boolean(model.print?.enabled)
  const slicerVerticalOffsetMm = getSlicerZUpVerticalOffset([model.meshes.combined])
  const surfaceTextureExport = buildSurfaceTextureExport(baseName, options.surfaceTexture)
  const threeMfEmbedsSurfaceTexture = printKitEnabled && isThreeMfEmbeddableTexture(surfaceTextureExport)
  const parts = printKitEnabled
    ? [
      ...(model.meshes.terrain?.faces?.length
        ? [{ key: 'terrain', file: `${baseName}-terrain.stl`, color: 'terrain paint', threeMfName: 'terrain', displayColor: getTerrainPartDisplayColor(model), mesh: model.meshes.terrain }]
        : []),
      // Use the band in front of base terrain (terrain as background, band as overlay)
      // In multi-band mode the terrain is the base and bands are overlays
      // In single-lowland mode the lowland is the only overlay
      ...(model.meshes.lowland?.faces?.length
        ? [{ key: 'lowland', file: `${baseName}-lowland-green.stl`, color: 'green lowland', threeMfName: 'lowland-green', displayColor: '#1F9F72FF', mesh: model.meshes.lowland }]
        : []),
      // Always put track, contours, snowline, snow, base, label
    ].filter((part) => part.mesh?.faces?.length)
    : []

  // Generate dynamic colour band parts (elevation or satellite)
  const colorBandParts = (() => {
    const bands = model.colorBands || {}
    let sources = []
    if (bands.elevationBands?.bands?.length) {
      sources = bands.elevationBands.bands.map((band, index) => ({
        key: `elevation-band-${index}`,
        file: `${baseName}-elevation-band-${index + 1}.stl`,
        color: band.name || `elevation band ${index + 1}`,
        threeMfName: band.name || `elevation-band-${index + 1}`,
        displayColor: (band.displayColor || '#808080') + 'FF',
        mesh: model.meshes.elevationBands?.[index],
      }))
    } else if (bands.satelliteBands?.bands?.length) {
      sources = bands.satelliteBands.bands.map((band, index) => ({
        key: `satellite-band-${index}`,
        file: `${baseName}-satellite-band-${index + 1}.stl`,
        color: band.name || `satellite band ${index + 1}`,
        threeMfName: band.name || `satellite-band-${index + 1}`,
        displayColor: (band.displayColor || '#808080') + 'FF',
        mesh: model.meshes.satelliteBands?.[index],
      }))
    }
    return sources.filter((part) => part.mesh?.faces?.length)
  })()

  const allParts = [
    ...parts,
    ...colorBandParts,
    { key: 'track', file: `${baseName}-track-red.stl`, color: 'red route', threeMfName: 'track-red', displayColor: '#D63B2EFF', mesh: model.meshes.track },
    { key: 'contours', file: `${baseName}-contours-white.stl`, color: 'white contours', threeMfName: 'contours-white', displayColor: '#F5F5F4FF', mesh: model.meshes.contours },
    { key: 'snowline', file: `${baseName}-snowline-white.stl`, color: 'white snowline', threeMfName: 'snowline-white', displayColor: '#F5F5F4FF', mesh: model.meshes.snowline },
    { key: 'snow', file: `${baseName}-snow-white.stl`, color: 'white snow cap', threeMfName: 'snow-white', displayColor: '#F5F5F4FF', mesh: model.meshes.snow },
    { key: 'base', file: `${baseName}-base-black.stl`, color: 'black base', threeMfName: 'base-black', displayColor: '#171717FF', mesh: model.meshes.base },
    { key: 'label', file: `${baseName}-label-white.stl`, color: 'white label', threeMfName: 'label-white', displayColor: '#F5F5F4FF', mesh: model.meshes.text },
  ].filter((part) => part.mesh?.faces?.length)
  const bambuPackagePlan = buildBambuSlicerPackagePlan(allParts, colorBandParts)
  const bambuParts = bambuPackagePlan.parts
  const threeMfFileName = printKitEnabled ? `${baseName}-print-kit.3mf` : null
  const bambuThreeMfFileName = printKitEnabled ? `${baseName}-bambu-print.3mf` : null
  const readiness = evaluateTerrainModelReadiness(model)
  const bambuPrintHandoffBase = printKitEnabled ? buildBambuPrintHandoff(baseName, bambuThreeMfFileName, bambuParts, model, bambuPackagePlan) : null
  const printPreflight = printKitEnabled
    ? buildTerrainPrintPreflight(model, bambuPrintHandoffBase, readiness, surfaceTextureExport)
    : null
  const bambuPrintHandoff = bambuPrintHandoffBase
    ? { ...bambuPrintHandoffBase, preflight: printPreflight }
    : null
  const manifest = {
    kind: model.kind,
    generatedAt: model.generatedAt,
    projection: model.projection,
    terrain: model.terrain,
    contours: model.contours,
    colorBands: model.colorBands || { enabled: false },
    snowline: model.snowline,
    route: {
      pointCount: model.route.pointCount,
      distanceMeters: model.route.distanceMeters,
      minElevationMeters: model.route.minElevationMeters,
      maxElevationMeters: model.route.maxElevationMeters,
      printGeometry: model.route.printGeometry || null,
    },
    stats: model.stats,
    readiness,
    surfaceTexture: surfaceTextureExport
      ? {
        ...surfaceTextureExport.manifest,
        threeMfEmbedded: threeMfEmbedsSurfaceTexture,
        threeMfTexturePath: threeMfEmbedsSurfaceTexture ? getThreeMfTexturePath(surfaceTextureExport.file) : null,
        printWorkflow: threeMfEmbedsSurfaceTexture
          ? '3mf-texture-exchange; fdm-printing-requires slicer texture support or color quantization'
          : 'external-texture-file',
      }
      : { enabled: false },
    validation: validateTerrainModelExport(model),
    export: {
      ...filenamePolicy,
      coordinateSystem: EXPORT_COORDINATE_SYSTEMS.SLICER_Z_UP,
      files: [],
    },
    print: printKitEnabled ? {
      ...model.print,
      package3mf: threeMfFileName,
      bambuPackage3mf: bambuThreeMfFileName,
      bambuWorkflow: 'bambu-orca-3mf-object-extruder-colors',
      preflight: printPreflight,
      bambu: bambuPrintHandoff,
      parts: allParts.map((part) => ({
        key: part.key,
        file: part.file,
        color: part.color,
      })),
      bambuParts: bambuParts.map((part) => ({
        key: part.key,
        file: part.file,
        color: part.color,
      })),
    } : undefined,
  }

  const surfaceTextureSpec = surfaceTextureExport?.file
    ? {
      name: surfaceTextureExport.file.name,
      mimeType: surfaceTextureExport.file.mimeType,
      build: () => surfaceTextureExport.file.content,
    }
    : null
  // The manifest references the full file-name list, so its content is filled
  // in after the spec list below is assembled (see manifestContent).
  let manifestContent = ''
  const manifestSpec = {
    name: `${baseName}-manifest.json`,
    mimeType: 'application/json',
    build: () => manifestContent,
  }

  const files = printKitEnabled
    ? [
      {
        name: threeMfFileName,
        mimeType: 'model/3mf',
        build: () => buildThreeMfPackage(model, baseName, allParts, {
          verticalOffsetMm: slicerVerticalOffsetMm,
          surfaceTextureExport,
        }),
      },
      {
        name: bambuThreeMfFileName,
        mimeType: 'model/3mf',
        build: () => buildBambuThreeMfPackage(model, baseName, bambuParts, {
          verticalOffsetMm: slicerVerticalOffsetMm,
        }),
      },
      {
        name: bambuPrintHandoff.guideFile,
        mimeType: 'text/plain',
        build: () => buildBambuPrintGuideText(bambuPrintHandoff),
      },
      {
        name: `${baseName}-print-kit.stl`,
        mimeType: 'model/stl',
        build: () => meshToAsciiStl(model.meshes.combined, `${baseName}_print_kit`, { verticalOffsetMm: slicerVerticalOffsetMm }),
      },
      ...allParts.map((part) => ({
        name: part.file,
        mimeType: 'model/stl',
        build: () => meshToAsciiStl(part.mesh, `${baseName}_${part.key}`, { verticalOffsetMm: slicerVerticalOffsetMm }),
      })),
      surfaceTextureSpec,
      manifestSpec,
    ].filter(Boolean)
    : [
      {
        name: `${baseName}-terrain-track.stl`,
        mimeType: 'model/stl',
        build: () => meshToAsciiStl(model.meshes.combined, `${baseName}_terrain_track`, { verticalOffsetMm: slicerVerticalOffsetMm }),
      },
      {
        name: `${baseName}-terrain.stl`,
        mimeType: 'model/stl',
        build: () => meshToAsciiStl(model.meshes.terrain, `${baseName}_terrain`, { verticalOffsetMm: slicerVerticalOffsetMm }),
      },
      (!printKitEnabled && model.meshes.contours?.faces?.length)
        ? {
          name: `${baseName}-contours.stl`,
          mimeType: 'model/stl',
          build: () => meshToAsciiStl(model.meshes.contours, `${baseName}_contours`, { verticalOffsetMm: slicerVerticalOffsetMm }),
        }
        : null,
      {
        name: `${baseName}-track.stl`,
        mimeType: 'model/stl',
        build: () => meshToAsciiStl(model.meshes.track, `${baseName}_track`, { verticalOffsetMm: slicerVerticalOffsetMm }),
      },
      surfaceTextureSpec,
      manifestSpec,
    ].filter(Boolean)

  manifest.export.files = files.map((file) => file.name)
  manifestContent = JSON.stringify(manifest, null, 2)
  return { files, manifest, manifestContent }
}

function materializeExportFile(spec) {
  return { name: spec.name, mimeType: spec.mimeType, content: spec.build() }
}

export function buildTerrainModelExportFiles(model, options = {}) {
  const { files } = buildExportFileSpecs(model, options)
  return files.map(materializeExportFile)
}

export function buildTerrainModelExportArchive(files = []) {
  const zip = new PizZip()
  files.forEach((file) => {
    if (!file?.name) return
    zip.file(file.name, file.content ?? '')
  })
  return zip.generate({ type: 'uint8array' })
}

// Cheap variant for the UI: returns the file list (names + mime types) and the
// fully-built manifest without serializing any STL/3MF content. Use this for
// rendering the delivery panel and workflow status; call
// buildTerrainModelExportFiles / buildTerrainModelExportFile only on download.
export function buildTerrainModelExportPlan(model, options = {}) {
  const { files, manifest, manifestContent } = buildExportFileSpecs(model, options)
  return {
    files: files.map((file) => ({ name: file.name, mimeType: file.mimeType })),
    manifest,
    manifestContent,
  }
}

export function buildTerrainModelExportFile(model, options = {}, fileName) {
  const { files } = buildExportFileSpecs(model, options)
  const spec = files.find((file) => file.name === fileName)
  return spec ? materializeExportFile(spec) : null
}
