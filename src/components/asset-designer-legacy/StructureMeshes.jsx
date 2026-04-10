/**
 * StructureMeshes — 结构元素批量渲染
 */
import ColumnMesh from './ColumnMesh'
import BeamMesh from './BeamMesh'
import StairMesh from './StairMesh'
import RampMesh from './RampMesh'

export default function StructureMeshes({
    structures = [],
    selection,
    onSelect,
    mode,
}) {
    return structures.map((structure) => {
        const isSelected = selection?.type === 'structure' && selection?.id === structure.id

        const commonProps = {
            key: `structure-${structure.id}`,
            structure,
            isSelected,
            onClick: () => onSelect?.('structure', structure.id),
            mode,
        }

        switch (structure.type) {
            case 'column':
                return <ColumnMesh {...commonProps} />
            case 'beam':
                return <BeamMesh {...commonProps} />
            case 'stair':
                return <StairMesh {...commonProps} />
            case 'ramp':
                return <RampMesh {...commonProps} />
            default:
                return null
        }
    })
}