/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates a decade-styled image from a source image and a prompt via the server-side proxy route.
 * @param imageDataUrl A data URL string of the source image (e.g., 'data:image/png;base64,...').
 * @param prompt The prompt to guide the image generation.
 * @returns A promise that resolves to a base64-encoded image data URL of the generated image.
 */
export async function generateDecadeImage(imageDataUrl: string, prompt: string): Promise<string> {
  const response = await fetch('/api/generate-decade', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageDataUrl,
      prompt,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Server error: ${response.statusText} (${response.status})`;
    try {
      const errorData = await response.json();
      if (errorData?.error) {
        errorMessage = errorData.error;
      }
    } catch {
      // Ignore JSON parsing errors for non-JSON responses
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  if (!data?.imageUrl) {
    throw new Error(data?.error || 'No image was returned from the server.');
  }

  return data.imageUrl;
}
