import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    rbacContext?: any;
  }
}

declare global {
  namespace Express {
    interface Request {
      rbacContext?: any;
    }
  }
}
