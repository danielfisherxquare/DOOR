export function isSiteModeBoundWorkZone(zone) {
    return zone?.metadata?.purpose === 'site-mode'
        || Boolean(zone?.snapshotJson?.siteBake);
}

export function assertGenericWorkZoneMutationAllowed(zone) {
    if (!isSiteModeBoundWorkZone(zone)) return zone;

    const error = new Error(
        '卫星场地区域必须通过项目绑定的 site-mode 接口更新，不能使用通用工作区接口'
    );
    error.statusCode = 409;
    error.expose = true;
    error.publicCode = 'SITE_MODE_BOUND';
    error.data = {
        projectId: zone?.projectId || null,
        focusZoneId: zone?.id || null,
    };
    throw error;
}
