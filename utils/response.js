const sendSuccess = (res, status, message, data = null) => {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
};

const sendError = (res, status, message, errors = null) => {
  return res.status(status).json({
    success: false,
    message,
    errors,
  });
};

module.exports = { sendSuccess, sendError };
