/**
 * File System Access API 封装
 * 用于访问用户本地文件系统和监控目录
 */

/**
 * 检测浏览器是否支持 File System Access API
 * @returns {boolean}
 */
export function hasFileSystemAccess() {
  return 'showDirectoryPicker' in window;
}

/**
 * 请求用户选择目录
 * @param {Object} options
 * @param {string} options.mode - 'read' | 'readwrite'
 * @returns {Promise<{success: boolean, handle?: FileSystemDirectoryHandle, name?: string, error?: string}>}
 */
export async function requestDirectoryAccess(options = {}) {
  const { mode = 'readwrite' } = options;

  if (!hasFileSystemAccess()) {
    return {
      success: false,
      error: '当前浏览器不支持 File System Access API，请使用 Chrome 或 Edge 浏览器',
    };
  }

  try {
    const handle = await window.showDirectoryPicker({ mode });
    return {
      success: true,
      handle,
      name: handle.name,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, error: '用户取消选择' };
    }
    return { success: false, error: err.message };
  }
}

/**
 * 请求用户选择文件
 * @param {Object} options
 * @param {string[]} options.accepts - 接受的文件类型
 * @param {boolean} options.multiple - 是否允许多选
 * @returns {Promise<{success: boolean, handles?: FileSystemFileHandle[], error?: string}>}
 */
export async function requestFileAccess(options = {}) {
  const { accepts = [], multiple = false } = options;

  if (!('showOpenFilePicker' in window)) {
    return {
      success: false,
      error: '当前浏览器不支持文件选择器',
    };
  }

  try {
    const handles = await window.showOpenFilePicker({
      multiple,
      types: accepts.length > 0 ? [{ accept: accepts.reduce((acc, t) => ({ ...acc, [t]: [] }), {}) }] : undefined,
    });
    return {
      success: true,
      handles,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, error: '用户取消选择' };
    }
    return { success: false, error: err.message };
  }
}

/**
 * 从 FileHandle 读取文件内容
 * @param {FileSystemFileHandle} fileHandle
 * @returns {Promise<{blob: Blob, arrayBuffer: ArrayBuffer, name: string, size: number, type: string, lastModified: number}>}
 */
export async function readFileFromHandle(fileHandle) {
  const file = await fileHandle.getFile();
  return {
    blob: file,
    arrayBuffer: await file.arrayBuffer(),
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  };
}

/**
 * 目录监控类
 * 通过轮询检测文件变化
 */
export class DirectoryWatcher {
  constructor(source, onChange, options = {}) {
    this.source = source;
    this.onChange = onChange;
    this.options = options;

    this.isFsa = source.type === 'fsa' || source instanceof FileSystemDirectoryHandle;
    this.handle = this.isFsa ? (source.handle || source) : null;
    this.files = source.files || null;

    this.knownFiles = new Map();
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * 开始监控
   * @param {number} pollInterval - 轮询间隔（毫秒）
   */
  async start(pollInterval = 2000) {
    if (this.isRunning) return;

    if (this.isFsa && this.handle) {
      // 初始扫描
      await this.scanFsa();
      // 开始轮询
      this.intervalId = setInterval(() => this.pollFsa(), pollInterval);
    } else {
      console.warn('Directory watching not supported in this browser mode');
    }

    this.isRunning = true;
  }

  /**
   * 停止监控
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.knownFiles.clear();
  }

  /**
   * 扫描目录（File System Access API）
   */
  async scanFsa() {
    const newFiles = [];

    try {
      for await (const entry of this.handle.values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          const key = `${entry.name}:${file.size}:${file.lastModified}`;

          if (!this.knownFiles.has(entry.name)) {
            this.knownFiles.set(entry.name, key);
            newFiles.push({
              handle: entry,
              file,
              name: entry.name,
              size: file.size,
              type: file.type,
              isNew: true,
            });
          } else if (this.knownFiles.get(entry.name) !== key) {
            this.knownFiles.set(entry.name, key);
            newFiles.push({
              handle: entry,
              file,
              name: entry.name,
              size: file.size,
              type: file.type,
              isModified: true,
            });
          }
        }
      }
    } catch (err) {
      console.error('Error scanning directory:', err);
    }

    return newFiles;
  }

  /**
   * 轮询检测变化
   */
  async pollFsa() {
    const changes = await this.scanFsa();
    if (changes.length > 0 && this.onChange) {
      this.onChange(changes);
    }
  }
}

/**
 * 传统文件夹选择（兼容Safari/Firefox）
 * 使用 webkitdirectory 属性
 * @returns {Promise<{success: boolean, files?: File[], name?: string, error?: string}>}
 */
export function selectDirectoryTraditional() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.style.display = 'none';

    input.onchange = (e) => {
      const files = Array.from(e.target.files || []);
      const folderName = files[0]?.webkitRelativePath?.split('/')[0] || 'folder';
      document.body.removeChild(input);
      resolve({
        success: true,
        files,
        name: folderName,
        type: 'traditional',
      });
    };

    input.oncancel = () => {
      document.body.removeChild(input);
      resolve({ success: false, error: '用户取消选择' });
    };

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * 统一的目录选择接口
 * 自动检测浏览器能力并使用合适的API
 * @param {Object} options
 * @returns {Promise<{success: boolean, handle?: any, files?: File[], name?: string, type?: string, error?: string}>}
 */
export async function selectDirectory(options = {}) {
  if (hasFileSystemAccess()) {
    const result = await requestDirectoryAccess(options);
    if (result.success) {
      return {
        ...result,
        type: 'fsa',
      };
    }
    return result;
  }

  // 回退到传统方式
  return selectDirectoryTraditional();
}

/**
 * 判断文件是否为发票
 * @param {string} fileName
 * @returns {boolean}
 */
export function isInvoiceFile(fileName) {
  const lower = fileName.toLowerCase();
  return (
    lower.includes('发票') ||
    lower.includes('invoice') ||
    lower.endsWith('.pdf') ||
    lower.includes('fapiao')
  );
}

/**
 * 判断文件是否为付款凭证
 * @param {string} fileName
 * @returns {boolean}
 */
export function isPaymentFile(fileName) {
  const lower = fileName.toLowerCase();
  return (
    lower.includes('支付') ||
    lower.includes('付款') ||
    lower.includes('转账') ||
    lower.includes('payment') ||
    lower.includes('transfer') ||
    /\.(png|jpg|jpeg|gif|webp)$/i.test(lower)
  );
}