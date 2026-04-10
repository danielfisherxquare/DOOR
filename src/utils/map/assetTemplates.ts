export interface StudioAssetTemplate {
  id: string;
  name?: string | null;
  category?: string | null;
  kind?: string | null;
  source?: string | null;
  thumbnailUrl?: string | null;
  defaultParameters?: Record<string, any> | null;
  parametersSchema?: Record<string, any> | null;
  modelUrl?: string | null;
}

const CATEGORY_TO_OBJECT_TYPE: Record<string, string> = {
  arch: 'arch',
  stage: 'stage',
  tent: 'tent',
  structure: 'tent',
  control: 'fence_segment',
  fence_segment: 'fence_segment',
  route_sign: 'route_sign',
  sign: 'route_sign',
  light_tower: 'light_tower',
  supply_station: 'supply_station',
  medical_station: 'medical_station',
};

export function inferObjectTypeFromText(value?: string | null): string {
  const name = String(value || '').toLowerCase();
  if (name.includes('帐篷') || name.includes('篷')) return 'tent';
  if (name.includes('舞台')) return 'stage';
  if (name.includes('拱门')) return 'arch';
  if (name.includes('灯')) return 'light_tower';
  if (name.includes('补给')) return 'supply_station';
  if (name.includes('医疗')) return 'medical_station';
  if (name.includes('围栏') || name.includes('护栏')) return 'fence_segment';
  if (name.includes('路标') || name.includes('指示')) return 'route_sign';
  return 'generic';
}

export function inferTemplateObjectType(template?: StudioAssetTemplate | null): string {
  const explicitType = String(template?.defaultParameters?.objectType || '').trim();
  if (explicitType && explicitType !== 'generic') return explicitType;

  const category = String(template?.category || '').trim().toLowerCase();
  if (category && CATEGORY_TO_OBJECT_TYPE[category]) {
    return CATEGORY_TO_OBJECT_TYPE[category];
  }

  return inferObjectTypeFromText(template?.name);
}

export function inferTemplatePlacementMode(template?: StudioAssetTemplate | null): 'follow-terrain' | 'level-platform' | 'vertical-keep' {
  const explicitMode = String(template?.defaultParameters?.placementMode || '').trim();
  if (explicitMode === 'follow-terrain' || explicitMode === 'level-platform' || explicitMode === 'vertical-keep') {
    return explicitMode;
  }

  const objectType = inferTemplateObjectType(template);
  if (objectType === 'light_tower' || objectType === 'route_sign') return 'vertical-keep';
  if (objectType === 'fence_segment') return 'follow-terrain';
  return 'level-platform';
}

export function getTemplateSceneSnapshot(template?: StudioAssetTemplate | null) {
  const defaults = template?.defaultParameters || {};
  return defaults.warehouseScene || defaults.sceneSnapshot || defaults.snapshotJson || null;
}

export function applyAssetTemplateToNode(template?: StudioAssetTemplate | null, currentNode: Record<string, any> = {}) {
  if (!template) return currentNode;

  const defaults = template.defaultParameters || {};
  const objectType = inferTemplateObjectType(template);
  const placementMode = inferTemplatePlacementMode(template);
  const fillColor = defaults.fillColor || defaults.color || currentNode.fillColor || currentNode.color || '#3388ff';
  const strokeColor = defaults.strokeColor || defaults.accentColor || currentNode.strokeColor || fillColor;

  return {
    templateId: template.id,
    templateName: template.name || currentNode.templateName || null,
    variantId: defaults.variantId || currentNode.variantId || null,
    objectType,
    placementMode,
    name: template.name || currentNode.name || '未命名模板对象',
    brandingPackId: defaults.brandingPackId ?? currentNode.brandingPackId ?? null,
    fasciaStyle: defaults.fasciaStyle ?? currentNode.fasciaStyle ?? 'classic',
    sponsorName: defaults.sponsorName ?? currentNode.sponsorName ?? '',
    accentColor: defaults.accentColor ?? currentNode.accentColor ?? strokeColor,
    color: fillColor,
    fillColor,
    strokeColor,
    strokeWeight: currentNode.strokeWeight ?? 3,
    fillOpacity: currentNode.fillOpacity ?? 0.3,
    assetTemplateSource: template.source || null,
    assetTemplateKind: template.kind || null,
  };
}
