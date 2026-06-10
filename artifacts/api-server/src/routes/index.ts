import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tmdbRouter from "./tmdb";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tmdbRouter);
router.use(notificationsRouter);

export default router;
