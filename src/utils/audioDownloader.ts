/**
 * Audio Download Helper for VoxCraft Studio
 * Handles direct WAV/audio file downloads across all browsers,
 * supporting data URIs, blob URIs, and remote stream endpoints.
 */

export interface DownloadAudioOptions {
  audioUrl: string;
  voiceName?: string;
  style?: string;
  customFilename?: string;
}

export async function downloadAudioFile({
  audioUrl,
  voiceName = 'voice',
  style = '',
  customFilename,
}: DownloadAudioOptions): Promise<boolean> {
  try {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    const cleanVoice = voiceName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const cleanStyle = style ? `-${style.toLowerCase().slice(0, 15).replace(/[^a-z0-9]+/g, '-')}` : '';
    const filename = customFilename || `voxcraft-${cleanVoice}${cleanStyle}-${timestamp}.wav`;

    // 1. For data URIs or blob URIs: direct trigger
    if (audioUrl.startsWith('data:') || audioUrl.startsWith('blob:')) {
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    }

    // 2. For remote/relative endpoints: fetch as Blob first
    // This avoids browser navigation or tab opening when download attribute is ignored
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio stream: ${response.statusText}`);
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up memory
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 15000);

    return true;
  } catch (err) {
    console.error('Download audio failed:', err);
    // Fallback: trigger standard browser navigation
    try {
      const a = document.createElement('a');
      a.href = audioUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (fallbackErr) {
      console.error('Fallback download also failed:', fallbackErr);
      return false;
    }
    return false;
  }
}
