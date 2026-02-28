import { memo } from 'react'

/**
 * 3D 冒号分隔符组件
 * 
 * 使用立方体球形模拟3D圆点
 * 
 * @param {Object} props
 * @param {boolean} props.isRunning - 计时器是否正在运行
 */
const Colon3D = memo(({ isRunning = true }) => {
    const colonClasses = [
        'colon-3d',
        !isRunning ? 'colon-3d--paused' : ''
    ].filter(Boolean).join(' ')

    return (
        <div className={colonClasses}>
            <div className="colon-3d__dot colon-3d__dot--top">
                <div className="colon-3d__dot-face colon-3d__dot-face--front" />
                <div className="colon-3d__dot-face colon-3d__dot-face--back" />
                <div className="colon-3d__dot-face colon-3d__dot-face--top" />
                <div className="colon-3d__dot-face colon-3d__dot-face--bottom" />
                <div className="colon-3d__dot-face colon-3d__dot-face--left" />
                <div className="colon-3d__dot-face colon-3d__dot-face--right" />
            </div>
            <div className="colon-3d__dot colon-3d__dot--bottom">
                <div className="colon-3d__dot-face colon-3d__dot-face--front" />
                <div className="colon-3d__dot-face colon-3d__dot-face--back" />
                <div className="colon-3d__dot-face colon-3d__dot-face--top" />
                <div className="colon-3d__dot-face colon-3d__dot-face--bottom" />
                <div className="colon-3d__dot-face colon-3d__dot-face--left" />
                <div className="colon-3d__dot-face colon-3d__dot-face--right" />
            </div>
        </div>
    )
})

Colon3D.displayName = 'Colon3D'

export default Colon3D
