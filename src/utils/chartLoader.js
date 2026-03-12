let chartPromise

export async function loadChartJs() {
  if (!chartPromise) {
    chartPromise = import('chart.js/auto').then(module => module.default ?? module.Chart ?? module)
  }

  return chartPromise
}
