'use strict';

module.exports = {
  createVideoResponse(videoId = 'mock-video-123') {
    return {
      code: 100,
      data: { video_id: videoId },
      message: 'Success',
    };
  },

  createStatusResponse(status = 'completed', videoUrl = 'https://example.com/video.mp4') {
    return {
      code: 100,
      data: { status, video_url: videoUrl },
      message: 'Success',
    };
  },

  createErrorResponse(message = 'API error') {
    return { code: 400, data: null, message };
  },
};
