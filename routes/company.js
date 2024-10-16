import { Router } from 'express';
import { authorizePermissions } from '../middlewares/full-auth.js';
import { authenticateUser } from '../middlewares/full-auth.js';
import * as controllers from '../controllers/company.js';
import { USER_ROLES } from '../constants/index.js';

const router = Router();
router
  .route('/')
  .post(
    authenticateUser,
    authorizePermissions(USER_ROLES.superAdmin),
    controllers.createCompany
  )
  .get(controllers.getCompanys);

router
  .route('/:id')
  .get(controllers.getSingleCompany)
  .patch(
    authenticateUser,
    authorizePermissions(USER_ROLES.superAdmin, USER_ROLES.admin),
    controllers.updateCompany
  )
  .delete(
    authenticateUser,
    authorizePermissions(USER_ROLES.superAdmin),
    controllers.deleteCompany
  );

export default router;
