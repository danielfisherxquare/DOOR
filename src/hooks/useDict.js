import { useState, useEffect } from 'react';
import request from '../utils/request';

const cache = new Map();

export function useDict(dictType) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!dictType) { setData([]); setLoading(false); return; }

    let cancelled = false;

    // Check cache first
    if (cache.has(dictType)) {
      setData(cache.get(dictType));
      setLoading(false);
      return;
    }

    request.get(`/public/dict/${dictType}`)
      .then(res => {
        if (cancelled) return;
        const items = res.data?.data || res.data || [];
        cache.set(dictType, items);
        setData(items);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [dictType]);

  const getLabel = (value) => {
    const item = data.find(d => d.dict_value === value || d.dictValue === value);
    return item?.dict_label || item?.dictLabel || value;
  };

  const getItem = (value) => {
    return data.find(d => d.dict_value === value || d.dictValue === value);
  };

  return { data, loading, error, getLabel, getItem };
}
