"use client";

import React from "react";
import { Modal } from "@/components/admin/ui/modal";
import {
  FileText,
  Image as ImageIcon,
  Download,
  ExternalLink,
  X,
  FileSpreadsheet,
  AlertCircle,
} from "lucide-react";
import { FileCategory } from "@/lib/file-validation";

export interface PreviewableAttachment {
  name: string;
  url: string;
  category: FileCategory;
  size?: string;
  description?: string;
}

interface AttachmentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  attachment: PreviewableAttachment | null;
}

export function AttachmentPreviewModal({
  isOpen,
  onClose,
  attachment,
}: AttachmentPreviewModalProps) {
  if (!isOpen || !attachment) return null;

  const isImage = attachment.category === "image";
  const isPdf = attachment.category === "pdf";
  const isWord = attachment.category === "word";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Attachment Preview — ${attachment.name}`}
      maxWidth="4xl"
    >
      <div className="space-y-4">
        {/* Top Information Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2.5 rounded-xl bg-slate-100/90 border border-slate-200 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            {isImage ? (
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                <ImageIcon className="h-4 w-4" />
              </span>
            ) : isWord ? (
              <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                <FileText className="h-4 w-4" />
              </span>
            ) : (
              <span className="p-1.5 rounded-lg bg-rose-100 text-rose-700">
                <FileText className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0">
              <p className="font-bold text-slate-800 truncate" title={attachment.name}>
                {attachment.name}
              </p>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                <span className="uppercase font-semibold px-1.5 py-0.2 rounded bg-white border border-slate-200">
                  {attachment.category}
                </span>
                {attachment.size && <span>• {attachment.size}</span>}
                {attachment.description && <span>• Row: {attachment.description}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={attachment.url}
              download={attachment.name}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors shadow-2xs text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download File</span>
            </a>

            <a
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold transition-colors shadow-2xs text-xs"
              title="Open directly in new browser tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Open in New Tab</span>
            </a>
          </div>
        </div>

        {/* Preview Content */}
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-900/5 min-h-[350px] flex items-center justify-center">
          {/* 1. Image Preview (High-res zoomable view) */}
          {isImage && (
            <div className="w-full flex items-center justify-center p-4 bg-slate-950/95 min-h-[450px] max-h-[72vh] overflow-auto">
              <img
                src={attachment.url}
                alt={attachment.name}
                className="max-w-full max-h-[68vh] object-contain rounded-lg shadow-2xl transition-transform"
              />
            </div>
          )}

          {/* 2. PDF Preview (Embedded Viewer) */}
          {isPdf && (
            <div className="w-full h-[65vh] bg-slate-100">
              <iframe
                src={`${attachment.url}#toolbar=1&navpanes=0`}
                title={attachment.name}
                className="w-full h-full border-0"
              />
            </div>
          )}

          {/* 3. Word Document Preview */}
          {isWord && (
            <div className="py-12 px-6 text-center max-w-lg mx-auto space-y-4">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-blue-50 border-2 border-blue-200 flex items-center justify-center text-blue-600 shadow-xs">
                <FileText className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-800 text-sm">{attachment.name}</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Microsoft Word documents (.doc, .docx) are saved and verified securely.
                  Download the file to edit or view it inside Microsoft Word, Office 365, or Google Docs.
                </p>
              </div>
              <div className="pt-2">
                <a
                  href={attachment.url}
                  download={attachment.name}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Word Document</span>
                </a>
              </div>
            </div>
          )}

          {/* 4. Fallback */}
          {!isImage && !isPdf && !isWord && (
            <div className="py-12 px-6 text-center space-y-3 text-slate-500">
              <AlertCircle className="h-10 w-10 text-slate-400 mx-auto" />
              <p className="text-xs font-semibold">Preview not available for this file type.</p>
              <a
                href={attachment.url}
                download={attachment.name}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Attachment</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
