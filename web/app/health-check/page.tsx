'use client';

import { useEffect, useState } from 'react';

export default function HealthCheckPage() {
  const [status, setStatus] = useState<string>('loading...');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus('error'));
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-16">
      <h1 className="text-2xl font-semibold">Health Check</h1>
      <p>
        API status: <span data-testid="api-status">{status}</span>
      </p>
    </div>
  );
}
