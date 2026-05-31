import { Router, type IRouter } from "express";
import healthRouter from "./health";
import rateRouter from "./rate";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rateRouter);

export default router;
