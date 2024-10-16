import { StatusCodes } from 'http-status-codes';

import Order from '../models/order.js';
import Cart from '../models/cart.js';
import Product from '../models/product.js';
import User from '../models/user.js';

import CustomError from '../errors/index.js';
import { checkPermissions } from '../utils/index.js';
import { PAYMENT_METHODS } from '../constants/paymentMethods.js';

// CREATE ONLINE ORDER ################
export const createOnlineOrder = async (req, res) => {
  const user =
    req.body.intention?.extras?.creation_extras?.userId || req.user._id;
  const paymentIntentId = req.body.intention?.id;
  const clientSecret = req.body.intention?.client_secret;
  const shippingAddress =
    req.body.intention?.extras?.creation_extras?.addressId;
  const amount = req.body.intention?.intention_detail?.amount;
  const orderItems = req.body.intention?.extras?.creation_extras?.cartItems;
  const shippingFee = 0;

  if (!req.body.transaction?.success) {
    throw new CustomError.BadRequestError(
      'Something went wrong while creating your order'
    );
  }
  const newOrder = {
    user,
    orderItems,
    subtotal: amount,
    total: amount + shippingFee,
    shippingFee,
    shippingAddress,
    clientSecret,
    paymentIntentId,
    paid: true,
    paymentMethod:
      PAYMENT_METHODS[req.body.intention.payment_methods[0].integration_id] ??
      PAYMENT_METHODS.cashOnDelivery,
  };

  const order = await Order.create(newOrder);

  res.status(StatusCodes.CREATED).json({ order });
};

// CREATE CASH ON DELIVERY ORDER
export const createCashOnDeliveryOrder = async (req, res) => {
  const { cartId, addressId } = req.body;

  const cart = await Cart.findById(cartId);

  if (!cart) {
    throw new CustomError.NotFoundError(`No cart with id : ${cartId}`);
  }

  const shippingFee = 0;

  const newOrder = {
    user: req.user._id,
    orderItems: cart.items,
    shippingAddress: addressId,
    subtotal: cart.totalPrice,
    total: cart.totalPrice + shippingFee,
    shippingFee,
    paid: false,
    paymentMethod: {
      id: 1,
      name: 'cashOnDelivery',
    },
  };

  const order = await Order.create(newOrder);
  await cart.deleteOne();

  res.status(StatusCodes.CREATED).json({ order });
};

// GET ALL ORDERS ##############
export const getAllOrders = async (req, res) => {
  let {
    name,
    status,
    company,
    paid,
    paymentMethod,
    period,
    sort,
    page = 1,
    limit = 10,
  } = req.query;

  let skip = (Number(page) - 1) * Number(limit);

  let queryObject = {};

  if (name) {
    const nameQuery = { $regex: name, $options: 'i' };
    const users = await User.find({
      $or: [
        { firstName: nameQuery },
        { lastName: nameQuery },
        { email: nameQuery },
      ],
    });

    const userIds = users.map((user) => user?._id) ?? [];
    queryObject.user = { $in: userIds };
  }

  if (status) {
    queryObject.status = { $in: status };
  }

  if (company) {
    queryObject['orderItems.product'] = {
      $in: await Product.find({ company }).select('_id'),
    };
  }

  if (paid) {
    queryObject.paid = paid;
  }

  if (paymentMethod) {
    queryObject['paymentMethod.name'] = paymentMethod;
  }

  if (period) {
    queryObject.createdAt = { $gte: period };
  }

  const orders = await Order.find(queryObject)
    .populate({
      path: 'user',
      select: 'firstName lastName email',
      options: { _recursed: true },
    })
    .sort(sort)
    .skip(skip)
    .limit(limit);

  const ordersCount = orders.length;
  const lastPage = Math.ceil(ordersCount / limit);
  res.status(StatusCodes.OK).json({
    totalCount: ordersCount,
    currentPage: Number(page),
    lastPage,
    orders,
  });
};

// GET SINGLE ORDER ############
export const getSingleOrder = async (req, res) => {
  const { id: orderId } = req.params;
  const order = await Order.findOne({ _id: orderId }).populate([
    'orderItems.variant',
    'shippingAddress',
  ]);
  if (!order) {
    throw new CustomError.NotFoundError(`No order with id : ${orderId}`);
  }
  checkPermissions(req.user, order.user);
  res.status(StatusCodes.OK).json({ order });
};

// GET CURRENT USER ORDERS #####
export const getCurrentUserOrders = async (req, res) => {
  let {
    page = 1,
    limit = 12,
    status,
    paid,
    paymentMethod,
    user,
    period,
  } = req.query;
  let skip = (Number(page) - 1) * Number(limit);

  let queryObject = {
    user: req.user._id,
  };

  if (status) {
    queryObject.status = status;
  }

  if (paid) {
    queryObject.paid = paid;
  }

  if (paymentMethod) {
    queryObject['paymentMethod.name'] = paymentMethod;
  }

  if (user) {
    queryObject.user = user;
  }

  if (period) {
    queryObject.createdAt = { $gte: period };
  }

  const orders = await Order.find(queryObject)
    // .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate(['orderItems.variant', 'shippingAddress']);

  const ordersCount = orders.length;
  const lastPage = Math.ceil(ordersCount / limit);
  res.status(StatusCodes.OK).json({
    totalCount: ordersCount,
    currentPage: Number(page),
    lastPage,
    orders,
  });
};

// GET CURRENT USER ORDERS #####
export const getCompanyOrders = async (req, res) => {
  let {
    page = 1,
    limit = 12,
    status,
    paid,
    paymentMethod,
    name,
    period,
  } = req.query;
  let skip = (Number(page) - 1) * Number(limit);

  let queryObject = {
    'orderItems.product': {
      $in: await Product.find({ company: req.user.company }).select('_id'),
    },
  };

  if (name) {
    const nameQuery = { $regex: name, $options: 'i' };
    const users = await User.find({
      $or: [
        { firstName: nameQuery },
        { lastName: nameQuery },
        { email: nameQuery },
      ],
    });

    const userIds = users.map((user) => user?._id) ?? [];
    queryObject.user = { $in: userIds };
  }

  if (status) {
    queryObject.status = status;
  }

  if (paid) {
    queryObject.paid = paid;
  }

  if (paymentMethod) {
    queryObject['paymentMethod.name'] = paymentMethod;
  }

  if (period) {
    queryObject.createdAt = { $gte: period };
  }

  const orders = await Order.find(queryObject)
    // .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'user',
    });

  const ordersCount = orders.length;
  const lastPage = Math.ceil(ordersCount / limit);
  res.status(StatusCodes.OK).json({
    totalCount: ordersCount,
    currentPage: Number(page),
    lastPage,
    orders,
  });
};

// UPDATE OREDR #################
export const updateOrder = async (req, res) => {
  const { id: orderId } = req.params;
  const { paymentIntentId } = req.body;

  const order = await Order.findOne({ _id: orderId });
  if (!order) {
    throw new CustomError.NotFoundError(`No order with id : ${orderId}`);
  }
  checkPermissions(req.user, order.user);

  order.paymentIntentId = paymentIntentId;
  order.status = 'processing';
  await order.save();

  res.status(StatusCodes.OK).json({ order });
};
