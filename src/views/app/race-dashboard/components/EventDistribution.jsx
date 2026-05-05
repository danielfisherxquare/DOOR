/**
 * EventDistribution - Pie/donut chart for event distribution using ECharts
 */
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

function EventDistribution({ data }) {
    const chartRef = useRef(null);
    const chartInstanceRef = useRef(null);

    useEffect(() => {
        if (!chartRef.current || !data || data.length === 0) return;

        // Initialize or reuse chart
        if (!chartInstanceRef.current) {
            chartInstanceRef.current = echarts.init(chartRef.current);
        }

        const chartData = data.map((item) => ({
            name: item.name,
            value: item.count,
        }));

        const option = {
            tooltip: {
                trigger: 'item',
                formatter: '{b}: {c} ({d}%)',
            },
            legend: {
                orient: 'vertical',
                right: 10,
                top: 'center',
                textStyle: {
                    fontSize: 12,
                    color: '#666',
                },
            },
            series: [
                {
                    type: 'pie',
                    radius: ['40%', '70%'],
                    center: ['35%', '50%'],
                    avoidLabelOverlap: false,
                    itemStyle: {
                        borderRadius: 6,
                        borderColor: '#fff',
                        borderWidth: 2,
                    },
                    label: {
                        show: false,
                    },
                    emphasis: {
                        label: {
                            show: true,
                            fontSize: 14,
                            fontWeight: 'bold',
                        },
                    },
                    labelLine: {
                        show: false,
                    },
                    data: chartData,
                    color: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272'],
                },
            ],
        };

        chartInstanceRef.current.setOption(option);

        // Handle resize
        const handleResize = () => {
            chartInstanceRef.current?.resize();
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [data]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            chartInstanceRef.current?.dispose();
        };
    }, []);

    if (!data || data.length === 0) {
        return (
            <div className="race-dashboard__empty-chart">
                <span className="material-symbols-outlined">pie_chart</span>
                <span>暂无项目分布数据</span>
            </div>
        );
    }

    return (
        <div
            ref={chartRef}
            className="race-dashboard__chart-container"
            style={{ width: '100%', height: '200px' }}
        />
    );
}

export default EventDistribution;