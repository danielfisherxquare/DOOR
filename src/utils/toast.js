import { toast } from 'react-toastify'

const defaultOptions = {
    position: 'top-right',
    autoClose: 2500,
    closeOnClick: true,
    pauseOnHover: true,
}

export function showSuccess(message, options = {}) {
    return toast.success(message, { ...defaultOptions, ...options })
}

export function showError(message, options = {}) {
    return toast.error(message, { ...defaultOptions, autoClose: 4000, ...options })
}

export function showWarning(message, options = {}) {
    return toast.warning(message, { ...defaultOptions, ...options })
}

export function showInfo(message, options = {}) {
    return toast.info(message, { ...defaultOptions, ...options })
}

export default { showSuccess, showError, showWarning, showInfo }
