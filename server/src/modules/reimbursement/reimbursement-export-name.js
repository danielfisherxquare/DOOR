export function resolveReimbursementExportName(project, fallback = '报销单') {
    const shortName = typeof project?.short_name === 'string' ? project.short_name.trim() : '';
    if (shortName) return shortName;

    const name = typeof project?.name === 'string' ? project.name.trim() : '';
    return name || fallback;
}
