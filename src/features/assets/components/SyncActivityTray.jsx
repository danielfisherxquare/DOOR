export default function SyncActivityTray({ jobs, onRetry }) {
  const activeJobs = jobs.filter((job) => job.state !== 'completed')
  if (activeJobs.length === 0) return null
  return (
    <section className="asset-activity" aria-label="上传与同步任务">
      {activeJobs.map((job) => (
        <div className="asset-activity__job" key={job.id}>
          <span className="material-symbols-outlined" aria-hidden="true">{job.state === 'failed' ? 'error' : 'cloud_upload'}</span>
          <div>
            <strong>{job.name}</strong>
            <progress value={job.progress} max="1" aria-label={`${job.name} 上传进度`} />
          </div>
          <span>{job.state === 'failed' ? job.error : `${Math.round(job.progress * 100)}%`}</span>
          {job.state === 'failed' && <button type="button" onClick={() => onRetry(job.id)}>重试</button>}
        </div>
      ))}
    </section>
  )
}
