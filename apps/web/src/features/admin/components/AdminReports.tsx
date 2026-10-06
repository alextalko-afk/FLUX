import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { api, ApiError } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Skeleton';

interface Report {
  id: string;
  reporterId: string;
  chatId: string | null;
  messageId: string | null;
  reason: string;
  status: string;
  createdAt: string;
  reporter: {
    id: string;
    username: string | null;
    firstName: string;
    lastName: string | null;
  };
}

export function AdminReports() {
  const queryClient = useQueryClient();
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolveStatus, setResolveStatus] = useState<'RESOLVED' | 'DISMISSED' | 'ACTION_TAKEN'>('RESOLVED');
  const [note, setNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'reports'],
    queryFn: () => api.get<{ items: Report[]; nextCursor: string | null }>('/admin/reports?limit=50'),
  });

  const resolveMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/reports/resolve', {
        reportId: selectedReport?.id,
        status: resolveStatus,
        note,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
      toast.success('Report resolved');
      setIsResolveModalOpen(false);
      setSelectedReport(null);
      setNote('');
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to resolve report');
      }
    },
  });

  const reports = data?.items || [];
  const pendingReports = reports.filter((r) => r.status === 'PENDING');

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-fg-primary">Reports</h2>
        <div className="text-sm text-fg-secondary">
          {pendingReports.length} pending
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="p-8 text-center text-sm text-fg-secondary bg-bg-panel border border-border rounded-lg">
          No reports yet
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-bg-panel border border-border rounded-lg p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      report.status === 'PENDING'
                        ? 'bg-fg-error/10 text-fg-error'
                        : report.status === 'ACTION_TAKEN'
                        ? 'bg-fg-accent/10 text-fg-accent'
                        : 'bg-fg-success/10 text-fg-success'
                    }`}>
                      {report.status}
                    </span>
                    <span className="text-xs text-fg-tertiary">
                      {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="text-sm text-fg-primary mb-1">{report.reason}</div>
                  <div className="text-xs text-fg-secondary">
                    Reported by: {report.reporter.firstName} {report.reporter.lastName || ''}
                    {report.reporter.username && ` (@${report.reporter.username})`}
                  </div>
                  {report.chatId && (
                    <div className="text-xs text-fg-tertiary mt-1">
                      Chat: {report.chatId}
                    </div>
                  )}
                  {report.messageId && (
                    <div className="text-xs text-fg-tertiary">
                      Message: {report.messageId}
                    </div>
                  )}
                </div>
                {report.status === 'PENDING' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedReport(report);
                      setIsResolveModalOpen(true);
                    }}
                  >
                    Resolve
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={isResolveModalOpen}
        onClose={() => {
          setIsResolveModalOpen(false);
          setSelectedReport(null);
          setNote('');
        }}
        title="Resolve report"
        size="md"
      >
        <div className="p-5 space-y-4">
          {selectedReport && (
            <div className="text-sm text-fg-secondary">
              Reason: <strong className="text-fg-primary">{selectedReport.reason}</strong>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-fg-primary mb-2">Resolution</label>
            <div className="space-y-2">
              {(['RESOLVED', 'DISMISSED', 'ACTION_TAKEN'] as const).map((status) => (
                <label key={status} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    checked={resolveStatus === status}
                    onChange={() => setResolveStatus(status)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-fg-primary">
                    {status === 'RESOLVED' && 'Resolved (no action needed)'}
                    {status === 'DISMISSED' && 'Dismissed (invalid report)'}
                    {status === 'ACTION_TAKEN' && 'Action taken (ban/delete/etc)'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-primary mb-1.5">Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-bg-app border border-border rounded-lg text-sm text-fg-primary placeholder:text-fg-tertiary focus:outline-none focus:ring-2 focus:ring-fg-accent resize-none"
              placeholder="Add a note about the resolution..."
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsResolveModalOpen(false);
                setSelectedReport(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={() => resolveMutation.mutate()}
              isLoading={resolveMutation.isPending}
              className="flex-1"
            >
              Resolve
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
