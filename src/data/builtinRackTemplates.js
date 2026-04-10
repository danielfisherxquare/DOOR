export const BUILTIN_RACK_TEMPLATES = [
  {
    id: 'builtin-standard-pallet',
    code: 'STD-24',
    name: '标准托盘货架',
    shape_type: 'standard',
    outer_dimensions_mm: { width_mm: 2400, depth_mm: 1000, height_mm: 3200 },
    levels: 4,
    bays: 2,
  },
  {
    id: 'builtin-heavy-pallet',
    code: 'HVY-27',
    name: '重型货架',
    shape_type: 'heavy',
    outer_dimensions_mm: { width_mm: 2700, depth_mm: 1200, height_mm: 4200 },
    levels: 5,
    bays: 3,
  },
  {
    id: 'builtin-light-shelf',
    code: 'LGT-18',
    name: '轻型层板架',
    shape_type: 'standard',
    outer_dimensions_mm: { width_mm: 1800, depth_mm: 600, height_mm: 2400 },
    levels: 5,
    bays: 4,
  },
  {
    id: 'builtin-bin-rack',
    code: 'BIN-20',
    name: '料箱架',
    shape_type: 'standard',
    outer_dimensions_mm: { width_mm: 2000, depth_mm: 800, height_mm: 2600 },
    levels: 6,
    bays: 4,
  },
]

export default BUILTIN_RACK_TEMPLATES
