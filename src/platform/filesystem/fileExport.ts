// ==============================================================================
// VISTAAR Super Admin — Cross-Platform File Export & Sharing Adapter
// Supports CSV, PDF, and JSON downloads and native share sheets
// ==============================================================================

import { platform } from '../index';

export interface FileExportOptions {
  filename: string;
  content: string | Blob;
  mimeType: string;
  shareTitle?: string;
}

class CrossPlatformFileExport {
  public async exportFile(options: FileExportOptions): Promise<{ success: boolean; message?: string }> {
    const { filename, content, mimeType, shareTitle = 'Export Report' } = options;

    try {
      // 1. Mobile (Capacitor Filesystem / Native Share Sheet)
      if (platform.isMobile()) {
        const cap = (window as any).Capacitor;
        if (cap?.Plugins?.Share) {
          // If content is string, can share directly or write to cache directory
          const textContent = typeof content === 'string' ? content : await content.text();
          await cap.Plugins.Share.share({
            title: shareTitle,
            text: textContent,
            dialogTitle: `Share ${filename}`,
          });
          return { success: true, message: 'Shared via native dialog' };
        }
      }

      // 2. Desktop (Tauri File Save)
      if (platform.isDesktop()) {
        const tauri = (window as any).__TAURI__;
        if (tauri?.dialog?.save && tauri?.fs?.writeFile) {
          const filePath = await tauri.dialog.save({
            defaultPath: filename,
            filters: [{ name: filename, extensions: [filename.split('.').pop() || '*'] }],
          });
          if (filePath) {
            const raw = typeof content === 'string' ? content : await content.text();
            await tauri.fs.writeFile(filePath, new TextEncoder().encode(raw));
            return { success: true, message: `Saved to ${filePath}` };
          }
        }
      }

      // 3. Web Download Fallback
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return { success: true, message: 'Download initiated' };
      }
    } catch (err: any) {
      console.error('[FileExport] Export failed:', err);
      return { success: false, message: err.message || 'Export failed' };
    }

    return { success: false, message: 'Platform export unsupported' };
  }
}

export const fileExport = new CrossPlatformFileExport();
