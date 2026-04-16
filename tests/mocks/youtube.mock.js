'use strict';

module.exports = {
  createUploadResponse(videoId = 'yt-mock-abc123') {
    return { id: videoId, kind: 'youtube#video', status: { uploadStatus: 'processed' } };
  },

  createSnippetResponse(videoId = 'yt-mock-abc123') {
    return {
      items: [{
        id: videoId,
        snippet: {
          title: 'Test Video',
          description: 'Test description',
          tags: ['test', 'video'],
          categoryId: '28',
        },
      }],
    };
  },

  createTokenResponse(accessToken = 'mock-access-token') {
    return { access_token: accessToken, expires_in: 3600, token_type: 'Bearer' };
  },

  createCommentResponse(commentId = 'comment-mock-123') {
    return {
      kind: 'youtube#commentThread',
      id:   commentId,
      snippet: { topLevelComment: { id: commentId } },
    };
  },
};
