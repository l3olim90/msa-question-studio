import { apiError, HttpError } from '@/lib/security';
import { cloudEnabled } from '@/lib/cloud';
import { signedAsset } from '@/lib/cloud-assets';
export async function GET(request: Request) {
  try {
    if (!cloudEnabled())
      throw new HttpError(404, 'Cloud source storage is not enabled.');
    const name = new URL(request.url).searchParams.get('name') || '';
    if (name.length > 300) throw new HttpError(400, 'Invalid source image.');
    return new Response(null, {
      status: 302,
      headers: {
        Location: await signedAsset(name),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
