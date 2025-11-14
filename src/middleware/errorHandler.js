const logger = require('../utils/logger');

/**
 * Custom error class for application errors
 */
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Centralized error handling middleware
 * This should be the last middleware in the chain
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.stack = err.stack;

  // Default error values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Log error details
  const errorLog = {
    message: error.message,
    statusCode,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userId: req.user?.user_id || 'unauthenticated',
    body: req.body,
    params: req.params,
    query: req.query,
  };

  // Sequelize Validation Error
  if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    const errors = err.errors.map((e) => e.message);
    errorLog.validationErrors = errors;
    logger.logWarn('Sequelize Validation Error', errorLog);
  }
  // Sequelize Unique Constraint Error
  else if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 409;
    message = 'Duplicate entry found';
    const field = err.errors[0]?.path || 'unknown field';
    errorLog.field = field;
    logger.logWarn('Unique Constraint Violation', errorLog);
  }
  // Sequelize Foreign Key Constraint Error
  else if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 400;
    message = 'Invalid reference to related data';
    logger.logWarn('Foreign Key Constraint Error', errorLog);
  }
  // Sequelize Database Error
  else if (err.name === 'SequelizeDatabaseError') {
    statusCode = 500;
    message = 'Database error occurred';
    logger.logError('Database Error', err, errorLog);
  }
  // JWT Errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    logger.logWarn('JWT Error', errorLog);
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    logger.logWarn('Token Expired', errorLog);
  }
  // Multer Errors (File Upload)
  else if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File size too large';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files';
    } else {
      message = `File upload error: ${err.code}`;
    }
    logger.logWarn('Multer Error', errorLog);
  }
  // AWS SDK Errors
  else if (err.name === 'S3ServiceException' || err.$metadata) {
    statusCode = 500;
    message = 'Cloud storage error';
    errorLog.awsError = err.name;
    logger.logError('AWS S3 Error', err, errorLog);
  }
  // Operational errors (expected errors)
  else if (err.isOperational) {
    logger.logWarn('Operational Error', errorLog);
  }
  // Programming or unknown errors (critical)
  else {
    logger.logError('Unhandled Error', err, errorLog);
    
    // Don't leak error details in production
    if (process.env.NODE_ENV === 'production') {
      message = 'Something went wrong';
    }
  }

  // Send error response
  const response = {
    success: false,
    message,
    ...(process.env.NODE_ENV !== 'production' && {
      error: error.message,
      stack: error.stack,
    }),
  };

  res.status(statusCode).json(response);
};

/**
 * Middleware to handle 404 errors
 */
const notFoundHandler = (req, res, next) => {
  const error = new AppError(`Route not found: ${req.originalUrl}`, 404);
  logger.logWarn('404 Not Found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
  });
  next(error);
};

/**
 * Async handler wrapper to catch errors in async route handlers
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError,
};

