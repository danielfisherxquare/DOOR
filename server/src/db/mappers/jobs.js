/**
 * jobs mapper 的集中管理入口
 * 实际映射逻辑在 src/modules/jobs/job.mapper.js 中
 */
export { fromDbRow, toJobStatusResponse } from '../../modules/jobs/job.mapper.js';
