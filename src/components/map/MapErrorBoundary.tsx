/**
 * MapErrorBoundary.tsx
 * 地图错误边界组件
 * 捕获地图渲染错误并显示友好的错误界面
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import './MapErrorBoundary.css';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class MapErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[MapErrorBoundary] Caught error:', error);
    console.error('[MapErrorBoundary] Error info:', errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <div className="map-error-boundary">
          <div className="error-content">
            <div className="error-kicker">地图工作台异常</div>
            <div className="error-icon">🗺️</div>
            <h2 className="error-title">地图画布暂时无法显示</h2>
            <p className="error-message">
              当前 GIS 工作台遇到了一个问题，底图或图层暂时无法正常渲染。
            </p>

            {error && (
              <div className="error-details">
                <details>
                  <summary>查看错误详情</summary>
                  <pre>{error.message}</pre>
                  {error.stack && (
                    <pre className="error-stack">{error.stack}</pre>
                  )}
                </details>
              </div>
            )}

            <div className="error-actions">
              <button className="error-btn primary" onClick={this.handleRetry}>
                重试
              </button>
              <button className="error-btn secondary" onClick={this.handleReload}>
                刷新页面
              </button>
            </div>

            <p className="error-hint">
              如果问题持续存在，请先检查网络连接、地图配置，再联系技术支持。
            </p>
          </div>
        </div>
      );
    }

    return children;
  }
}
