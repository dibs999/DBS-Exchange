import React, { useEffect } from 'react';

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
  details?: { label: string; value: string }[];
};

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning',
  onConfirm,
  onCancel,
  details,
}: ConfirmDialogProps) {
  // Handle ESC key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
      if (e.key === 'Enter' && isOpen) {
        onConfirm();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, onConfirm]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className={`modal confirm-dialog confirm-${variant}`} onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon">
          {variant === 'danger' && '⚠️'}
          {variant === 'warning' && '⚡'}
          {variant === 'info' && 'ℹ️'}
        </div>
        
        <h3>{title}</h3>
        <p className="muted">{message}</p>

        {details && details.length > 0 && (
          <div className="confirm-details">
            {details.map((detail, idx) => (
              <div key={idx} className="confirm-detail-row">
                <span className="label">{detail.label}</span>
                <span>{detail.value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="confirm-actions">
          <button className="btn ghost" onClick={onCancel}>
            {cancelText}
          </button>
          <button 
            className={`btn ${variant === 'danger' ? 'btn-danger' : 'primary'}`} 
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

