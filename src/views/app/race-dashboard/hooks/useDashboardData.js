import { useCallback, useEffect, useRef, useState } from 'react';
import raceDashboardApi from '../../../../api/raceDashboard';

/**
 * Hook to fetch and refresh dashboard data
 * @param {string} raceId - Race ID
 * @param {boolean} masked - If true, fetch masked data
 * @param {number} refreshInterval - Auto refresh interval in ms (default 30000)
 */
export function useDashboardData(raceId, masked = false, refreshInterval = 30000) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const refreshTimerRef = useRef(null);

    const fetchData = useCallback(async () => {
        if (!raceId) {
            setData(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await raceDashboardApi.getOverview(raceId, masked);
            if (response.success) {
                setData(response.data);
            } else {
                setError(response.message || '加载失败');
            }
        } catch (err) {
            setError(err.message || '网络错误');
        } finally {
            setLoading(false);
        }
    }, [raceId, masked]);

    // Initial fetch
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Auto refresh
    useEffect(() => {
        if (!raceId || refreshInterval <= 0) return;

        refreshTimerRef.current = setInterval(fetchData, refreshInterval);

        return () => {
            if (refreshTimerRef.current) {
                clearInterval(refreshTimerRef.current);
            }
        };
    }, [raceId, refreshInterval, fetchData]);

    // Manual refresh
    const refresh = useCallback(() => {
        fetchData();
    }, [fetchData]);

    return {
        data,
        loading,
        error,
        refresh,
    };
}

/**
 * Hook to determine if data should be masked
 * Based on user's capability: race_dashboard:view
 * Users with this capability see full data (internal staff)
 * Users without see masked data (external leaders/clients)
 */
export function useMaskedMode() {
    const hasCapability = useAuthStore((state) => state.hasCapability);

    // If user has race_dashboard:view capability, they see full data
    // Otherwise, data is masked for external viewers
    return !hasCapability('race_dashboard', 'view');
}

// Import auth store for useMaskedMode
import useAuthStore from '../../../../stores/authStore';

export default {
    useDashboardData,
    useMaskedMode,
};
