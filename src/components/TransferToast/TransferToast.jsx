import './TransferToast.css';
import {
  FiCheckCircle,
  FiAlertTriangle,
  FiXCircle,
  FiX,
  FiArrowRight,
  FiLoader,
  FiClock,
  FiFolder,
  FiFile,
} from 'react-icons/fi';

const CLOUD_LABEL = {
  onedrive: 'OneDrive',
  google: 'Google Drive',
};

export default function TransferToast({ transfers, onDismiss, onClearCompleted }) {
  if (!transfers || transfers.length === 0) return null;

  const activeCount = transfers.filter((t) => t.status === 'active').length;
  const queuedCount = transfers.filter((t) => t.status === 'queued').length;
  const inFlightCount = activeCount + queuedCount;
  const hasFinished = transfers.some((t) => t.status !== 'active' && t.status !== 'queued');

  return (
    <section className="transfer-toast" aria-label="Cross-cloud transfers" aria-live="polite">
      <div className="transfer-toast-header">
        <div className="transfer-toast-title">
          {inFlightCount > 0 ? (
            <>
              <FiLoader className="transfer-spin" size={14} />
              <span>
                Transferring {activeCount}
                {queuedCount > 0 ? ` (${queuedCount} queued)` : ` item${activeCount === 1 ? '' : 's'}`}…
              </span>
            </>
          ) : (
            <span>Transfers</span>
          )}
        </div>
        {hasFinished && (
          <button
            type="button"
            className="transfer-clear-btn"
            onClick={onClearCompleted}
          >
            Clear finished
          </button>
        )}
      </div>

      <div className="transfer-toast-list">
        {transfers.map((t) => (
          <div
            key={t.id}
            className={`transfer-row transfer-row--${t.status}`}
          >
            <div className="transfer-row-top">
              <span className="transfer-status-icon" aria-hidden="true">
                {t.status === 'queued' && <FiClock size={15} />}
                {t.status === 'active' && <FiLoader className="transfer-spin" size={15} />}
                {t.status === 'success' && <FiCheckCircle size={15} />}
                {t.status === 'warning' && <FiAlertTriangle size={15} />}
                {t.status === 'error' && <FiXCircle size={15} />}
              </span>

              <span className="transfer-item-type-icon" aria-hidden="true">
                {t.isFolder ? <FiFolder size={13} /> : <FiFile size={13} />}
              </span>

              <span className="transfer-item-name" title={t.itemName}>
                {t.itemName}
              </span>

              <span className={`transfer-mode-badge transfer-mode-badge--${t.mode}`}>
                {t.mode === 'delete'
                  ? 'Delete'
                  : t.mode === 'rename'
                  ? 'Rename'
                  : t.mode === 'move'
                  ? 'Move'
                  : 'Copy'}
              </span>

              {t.status !== 'active' && t.status !== 'queued' && (
                <button
                  type="button"
                  className="transfer-dismiss-btn"
                  onClick={() => onDismiss(t.id)}
                  aria-label={`Dismiss ${t.itemName}`}
                >
                  <FiX size={14} />
                </button>
              )}
            </div>

            <div className="transfer-route">
              {t.mode === 'delete' || t.mode === 'rename' ? (
                <span>{t.sourceLabel || CLOUD_LABEL[t.sourceCloud]}</span>
              ) : (
                <>
                  <span>{t.sourceLabel || CLOUD_LABEL[t.sourceCloud]}</span>
                  <FiArrowRight size={11} />
                  <span>
                    {t.targetLabel || CLOUD_LABEL[t.targetCloud]}
                    {t.targetFolderName ? ` / ${t.targetFolderName}` : ''}
                  </span>
                </>
              )}
            </div>

            {t.status === 'active' && (
              <div className="transfer-progress-track">
                <div
                  className="transfer-progress-fill"
                  style={{ width: `${Math.max(6, t.percent || 0)}%` }}
                />
              </div>
            )}

            <div className="transfer-detail">{t.detail}</div>

            {t.warnings && t.warnings.length > 0 && (
              <ul className="transfer-warnings">
                {t.warnings.slice(0, 3).map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
                {t.warnings.length > 3 && (
                  <li>…and {t.warnings.length - 3} more</li>
                )}
              </ul>
            )}

            {t.error && <div className="transfer-error-msg">{t.error}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
