/** Block business APIs until an account has completed its required password change. */
export function requirePasswordChanged(req, res, next) {
    if (!req.authContext?.mustChangePassword) {
        return next();
    }

    const message = '首次登录或密码重置后必须先修改密码';
    return res.status(403).json({
        success: false,
        error: {
            code: 'PASSWORD_CHANGE_REQUIRED',
            message,
        },
        message,
    });
}
