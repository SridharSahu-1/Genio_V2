import { FastifyInstance } from 'fastify';
import { initUpload, startProcessing, getVideos, getSubtitleDownloadUrl, getVideoPlaybackUrl, verifyUpload, directUpload, uploadFromUrl, serveVideoFile, serveSubtitleFile } from '../controllers/videoController';

export default async function videoRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // Direct upload (bypasses S3)
  fastify.post('/upload-direct', directUpload);
  
  // Upload from URL
  fastify.post('/upload-url', uploadFromUrl);
  
  // S3 upload (existing)
  fastify.post('/upload', initUpload);
  fastify.post('/verify', verifyUpload);
  fastify.post('/process', startProcessing);
  fastify.get('/', getVideos);
  fastify.get('/download/:key', getSubtitleDownloadUrl);
  fastify.get('/playback/:videoId', getVideoPlaybackUrl);
  fastify.get('/file/:videoId', serveVideoFile);
  fastify.get('/subtitle/:videoId', serveSubtitleFile);
}



