const errorResponse = (res, statusCode, message, errors= []) => {
  const payload = {
    success: false,
    message,
    errors  
  };
  res.locals.errorMessage = message; // Store error message for logging
  return res.status(statusCode).json(payload);
}



const successResponse = (res, statusCode, message, data = {}) => {
    const payload = {
        success: true,
        message,
        data
    };
    return res.status(statusCode).json(payload);
}





module.exports = {
    errorResponse,
    successResponse
};