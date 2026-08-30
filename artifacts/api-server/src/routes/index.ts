import { Router, type IRouter, type RequestHandler } from "express";
import healthRouter from "./health";
import assistantRouter from "./assistant";
import { createEnterpriseRouter } from "./enterprise";

export const createRouter = (enterpriseAuth?: RequestHandler): IRouter => {
  const router: IRouter = Router();
  router.use(healthRouter);
  router.use(assistantRouter);
  router.use(createEnterpriseRouter(enterpriseAuth));
  return router;
};

export default createRouter();
