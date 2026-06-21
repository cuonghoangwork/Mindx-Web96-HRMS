import { Router } from "express";
import authRouter from "./authRouter.js";
import employeeRouter from "./employeeRouter.js";
import departmentRouter from "./departmentRouter.js";
import attendanceRouter from "./attendanceRouter.js";
import jobRouter from "./jobRouter.js";
import candidateRouter from "./candidateRouter.js";
import holidayRouter from "./holidayRouter.js";
import notificationRouter from "./notificationRouter.js";

const rootRouter = Router();

rootRouter.use("/auth", authRouter);
rootRouter.use("/employees", employeeRouter);
rootRouter.use("/departments", departmentRouter);
rootRouter.use("/attendance", attendanceRouter);
rootRouter.use("/jobs", jobRouter);
rootRouter.use("/candidates", candidateRouter);
rootRouter.use("/holidays", holidayRouter);
rootRouter.use("/notifications", notificationRouter);

export default rootRouter;
