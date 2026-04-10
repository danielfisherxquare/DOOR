const STATUS_CONFIGS = {
    in_stock: { label: '在库', className: 'pill pill--green' },
    allocated: { label: '已分配', className: 'pill pill--blue' },
    picked: { label: '已领取', className: 'pill pill--accent' },
    returned: { label: '已归还', className: 'pill pill--yellow' },
    damaged: { label: '损坏', className: 'pill pill--red' },
    lost: { label: '丢失', className: 'pill pill--red' },
    draft: { label: '草稿', className: 'pill pill--yellow' },
    active: { label: '启用', className: 'pill pill--green' },
    archived: { label: '归档', className: 'pill pill--blue' },
    inactive: { label: '停用', className: 'pill pill--yellow' },
    empty: { label: '空', className: 'pill pill--blue' },
    partial: { label: '部分', className: 'pill pill--yellow' },
    full: { label: '满', className: 'pill pill--green' },
    locked: { label: '锁定', className: 'pill pill--red' },
    in_progress: { label: '进行中', className: 'pill pill--blue' },
    completed: { label: '已完成', className: 'pill pill--green' },
    cancelled: { label: '已取消', className: 'pill pill--red' },
    inbound: { label: '入库', className: 'pill pill--green' },
    outbound: { label: '出库', className: 'pill pill--blue' },
    allocate: { label: '分配', className: 'pill pill--accent' },
    pickup: { label: '领取', className: 'pill pill--accent' },
    return: { label: '归还', className: 'pill pill--yellow' },
}

export default function StatusPill({ status, configs }) {
    const merged = { ...STATUS_CONFIGS, ...configs }
    const config = merged[status] || { label: status, className: 'pill' }
    return <span className={config.className}>{config.label}</span>
}
