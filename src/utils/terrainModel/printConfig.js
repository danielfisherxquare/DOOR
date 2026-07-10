export const PRINT_READABLE_MAX_FOOTPRINT_RATIO = 0.22
export const PRINT_LAYER_LOCK_OVERLAP_MM = 0.22

export const FILAMENT_PROFILES = {
  'PLA Basic': {
    filamentSettingsId: 'Bambu PLA Basic @BBL H2C',
    filamentId: 'GFA00',
    filamentType: 'PLA',
    filamentVendor: 'Bambu Lab',
    nozzleTemperature: [220, 220],
    bedTemperature: [55, 55],
    flowRatio: '0.99',
    maxVolumetricSpeed: '12',
  },
  'PLA Matte': {
    filamentSettingsId: 'Bambu PLA Matte @BBL H2C',
    filamentId: 'GFA01',
    filamentType: 'PLA',
    filamentVendor: 'Bambu Lab',
    nozzleTemperature: [220, 220],
    bedTemperature: [55, 55],
    flowRatio: '0.98',
    maxVolumetricSpeed: '12',
  },
  'PLA Silk': {
    filamentSettingsId: 'Bambu PLA Silk @BBL H2C',
    filamentId: 'GFA02',
    filamentType: 'PLA',
    filamentVendor: 'Bambu Lab',
    nozzleTemperature: [230, 230],
    bedTemperature: [55, 55],
    flowRatio: '0.98',
    maxVolumetricSpeed: '10',
  },
  PETG: {
    filamentSettingsId: 'Bambu PETG Basic @BBL H2C',
    filamentId: 'GFB00',
    filamentType: 'PETG',
    filamentVendor: 'Bambu Lab',
    nozzleTemperature: [255, 255],
    bedTemperature: [70, 70],
    flowRatio: '0.95',
    maxVolumetricSpeed: '8',
  },
  ABS: {
    filamentSettingsId: 'Bambu ABS @BBL H2C',
    filamentId: 'GFC00',
    filamentType: 'ABS',
    filamentVendor: 'Bambu Lab',
    nozzleTemperature: [260, 260],
    bedTemperature: [90, 90],
    flowRatio: '0.95',
    maxVolumetricSpeed: '8',
  },
}

export const DEFAULT_FILAMENT_TYPE = 'PLA Basic'
export const FILAMENT_TYPES = Object.keys(FILAMENT_PROFILES)
