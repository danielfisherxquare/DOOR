/**
 * MapOnboarding.tsx
 * 地图功能新手引导组件
 * 首次使用时展示功能介绍
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import './MapOnboarding.css';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: '欢迎进入 GIS 工作台',
    description: '这里是 DOOR 的宏观空间视图，用来查看底图、图层、锚点和场地上下文，并与空间工作台连续切换。',
    icon: 'map',
  },
  {
    id: 'view-modes',
    title: '多视图模式',
    description: '支持 2D 平面地图、Cesium 3D 地球和高德 3D 视图，可根据任务自由切换。',
    icon: 'public',
  },
  {
    id: 'drawing',
    title: '图形绘制',
    description: '使用左侧工具栏绘制多边形、折线、圆形、矩形和标记点，并持续管理空间标注。',
    icon: 'edit',
  },
  {
    id: 'layers',
    title: '图层管理',
    description: '在图层面板管理绘制对象的显示、隐藏、重命名和删除，保持地图语义清晰。',
    icon: 'layers',
  },
  {
    id: 'models',
    title: '3D 模型',
    description: '上传 glTF/GLB 模型并放置到 3D 地球上，用于建立空间锚点和外部环境参考。',
    icon: 'view_in_ar',
  },
  {
    id: 'offline',
    title: '离线下载',
    description: '可按区域手动下载瓦片，便于现场环境下继续浏览已准备好的底图区域。',
    icon: 'save',
  },
];

const STORAGE_KEY = 'map-onboarding-completed';

export default function MapOnboarding() {
  const [searchParams] = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const projectId = searchParams.get('projectId');

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed && !projectId) {
      setVisible(true);
    }
  }, [projectId]);

  useEffect(() => {
    if (!visible) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleSkip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible]);

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  };

  const handleFinish = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  const step = ONBOARDING_STEPS[currentStep];
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <div
      className="onboarding-overlay"
      onClick={handleSkip}
      role="presentation"
    >
      <div
        className="onboarding-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="地图工作台引导"
      >
        <button
          type="button"
          className="onboarding-close"
          onClick={handleSkip}
          aria-label="关闭引导"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
        <div className="onboarding-kicker">地图工作台引导</div>
        {/* 进度指示器 */}
        <div className="onboarding-progress">
          {ONBOARDING_STEPS.map((_, index) => (
            <div
              key={index}
              className={`progress-dot ${index === currentStep ? 'active' : ''} ${
                index < currentStep ? 'completed' : ''
              }`}
              onClick={() => setCurrentStep(index)}
            />
          ))}
        </div>

        {/* 内容区域 */}
        <div className="onboarding-content">
          <div className="onboarding-icon material-symbols-outlined">{step.icon}</div>
          <h2 className="onboarding-title">{step.title}</h2>
          <p className="onboarding-description">{step.description}</p>
        </div>

        {/* 操作按钮 */}
        <div className="onboarding-actions">
          <button className="onboarding-btn skip" onClick={handleSkip}>
            跳过引导
          </button>

          <div className="onboarding-nav">
            {currentStep > 0 && (
              <button className="onboarding-btn secondary" onClick={handlePrev}>
                上一步
              </button>
            )}

            {isLastStep ? (
              <button className="onboarding-btn primary" onClick={handleFinish}>
                进入工作台
              </button>
            ) : (
              <button className="onboarding-btn primary" onClick={handleNext}>
                下一步
              </button>
            )}
          </div>
        </div>

        {/* 步骤计数 */}
        <div className="onboarding-counter">
          {currentStep + 1} / {ONBOARDING_STEPS.length}
        </div>
      </div>
    </div>
  );
}
