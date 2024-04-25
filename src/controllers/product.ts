import { Request } from "express";
import { TryCatch } from "../middlewares/error";
import {
  BaseQuery,
  NewProductRequestBody,
  SearchRequestQuery,
} from "../types/types.js";
import { Product } from "../models/product";
import ErrorHandler from "../utils/utility-class";
import fs, { rm } from "fs";
import { myCache } from "../app";
import { v2 as cloudinary } from "cloudinary";
import { invalidateCache, uploadFilesToCloudinary } from "../utils/features";
// import { faker } from "@faker-js/faker";

// Revalidate on New,Update,Delete Product & on New Order
export const getlatestProducts = TryCatch(async (req, res, next) => {
  let products;

  if (myCache.has("latest-products"))
    products = JSON.parse(myCache.get("latest-products") as string);
  else {
    products = await Product.find({}).sort({ createdAt: -1 }).limit(5);
    myCache.set("latest-products", JSON.stringify(products));
  }

  return res.status(200).json({
    success: true,
    products,
  });
});

// Revalidate on New,Update,Delete Product & on New Order
export const getAllCategories = TryCatch(async (req, res, next) => {
  let categories;

  if (myCache.has("categories"))
    categories = JSON.parse(myCache.get("categories") as string);
  else {
    categories = await Product.distinct("category");
    myCache.set("categories", JSON.stringify(categories));
  }

  return res.status(200).json({
    success: true,
    categories,
  });
});

// Revalidate on New,Update,Delete Product & on New Order
export const getAdminProducts = TryCatch(async (req, res, next) => {
  let products;
  if (myCache.has("all-products"))
    products = JSON.parse(myCache.get("all-products") as string);
  else {
    products = await Product.find({});
    myCache.set("all-products", JSON.stringify(products));
  }

  return res.status(200).json({
    success: true,
    products,
  });
});

export const getSingleProduct = TryCatch(async (req, res, next) => {
  let product;
  const id = req.params.id;
  if (myCache.has(`product-${id}`))
    product = JSON.parse(myCache.get(`product-${id}`) as string);
  else {
    product = await Product.findById(id);

    if (!product) return next(new ErrorHandler("Product Not Found", 404));

    myCache.set(`product-${id}`, JSON.stringify(product));
  }

  return res.status(200).json({
    success: true,
    product,
  });
});

export const newProduct = TryCatch(
  async (req: Request<{}, {}, NewProductRequestBody>, res, next) => {
    const { name, price, stock, category } = req.body;
    const photo = req.file?.path;
    console.log(photo)
    if (!photo) return next(new ErrorHandler("Please add Photo", 400));
    // const result = await uploadFilesToCloudinary([photo]);
    // console.log(result)
    // console.log("hello")
    // const photoProduct = {
    //   public_id: result[0].public_id,
    //   url: result[0].url,
    // };

    if (!name || !price || !stock || !category) {
      fs.unlinkSync(photo);

      return next(new ErrorHandler("Please enter All Fields", 400));
    }
    const myCloud = await cloudinary.uploader.upload(photo, {
      folder: 'social-media-profile',
    });
    fs.unlinkSync(photo);
    await Product.create({
      name,
      price,
      stock,
      category: category.toLowerCase(),
      photo: {
        public_id: myCloud.public_id,
        url: myCloud.secure_url
      },
    });

    invalidateCache({ product: true, admin: true });

    return res.status(201).json({
      success: true,
      message: "Product Created Successfully",
    });
  }
);

export const updateProduct = TryCatch(async (req: Request, res, next) => {
  const { id } = req.params;
  const { name, price, stock, category } = req.body;
  const photo = req.file;

  const product = await Product.findById(id);

  if (!product) {
    return next(new ErrorHandler("Product Not Found", 404));
  }

  let updatedPhotoData;
  if (photo && photo.path) {
    try {
      // Delete previous photo data from Cloudinary
      if (product.photo?.public_id) {
        await cloudinary.uploader.destroy(product.photo.public_id);
      }


      // Upload new photo to Cloudinary
      const uploadedPhoto = await cloudinary.uploader.upload(photo.path, {
        folder: 'social-media-profile',
      });

      updatedPhotoData = {
        public_id: uploadedPhoto.public_id,
        url: uploadedPhoto.secure_url,
      };

      // Remove the temporary file from the server
      fs.unlinkSync(photo.path);
    } catch (error) {
      return next(new ErrorHandler("Failed to update product photo", 500));
    }
  }

  // Update product fields if provided
  if (name) product.name = name;
  if (price) product.price = price;
  if (stock) product.stock = stock;
  if (category) product.category = category;
  if (updatedPhotoData) product.photo = updatedPhotoData;

  try {
    await product.save();

    // Invalidate relevant caches
    invalidateCache({
      product: true,
      productId: String(product._id),
      admin: true,
    });

    return res.status(200).json({
      success: true,
      message: "Product Updated Successfully",
    });
  } catch (error) {
    return next(new ErrorHandler("Failed to update product", 500));
  }
});

export const deleteProduct = TryCatch(async (req, res, next) => {
  const product = await Product.findById(req.params.id);
  if (!product) return next(new ErrorHandler("Product Not Found", 404));

  if (product.photo?.public_id) {
    try {
      // Delete photo data from Cloudinary
      await cloudinary.uploader.destroy(product.photo.public_id);
    } catch (error) {
      return next(new ErrorHandler("Failed to delete product photo", 500));
    }
  }

  // Delete the product from the database
  await product.deleteOne();

  // Invalidate relevant caches
  invalidateCache({
    product: true,
    productId: String(product._id),
    admin: true,
  });

  return res.status(200).json({
    success: true,
    message: "Product Deleted Successfully",
  });
});


export const getAllProducts = TryCatch(
  async (req: Request<{}, {}, {}, SearchRequestQuery>, res, next) => {
    const { search, sort, category, price } = req.query;

    const page = Number(req.query.page) || 1;
    // 1,2,3,4,5,6,7,8
    // 9,10,11,12,13,14,15,16
    // 17,18,19,20,21,22,23,24
    const limit = Number(process.env.PRODUCT_PER_PAGE) || 8;
    const skip = (page - 1) * limit;

    const baseQuery: BaseQuery = {};

    if (search)
      baseQuery.name = {
        $regex: search,
        $options: "i",
      };

    if (price)
      baseQuery.price = {
        $lte: Number(price),
      };

    if (category) baseQuery.category = category;

    const productsPromise = Product.find(baseQuery)
      .sort(sort && { price: sort === "asc" ? 1 : -1 })
      .limit(limit)
      .skip(skip);

    const [products, filteredOnlyProduct] = await Promise.all([
      productsPromise,
      Product.find(baseQuery),
    ]);

    const totalPage = Math.ceil(filteredOnlyProduct.length / limit);

    return res.status(200).json({
      success: true,
      products,
      totalPage,
    });
  }
);

// const generateRandomProducts = async (count: number = 10) => {
//   const products = [];

//   for (let i = 0; i < count; i++) {
//     const product = {
//       name: faker.commerce.productName(),
//       photo: "uploads\\5ba9bd91-b89c-40c2-bb8a-66703408f986.png",
//       price: faker.commerce.price({ min: 1500, max: 80000, dec: 0 }),
//       stock: faker.commerce.price({ min: 0, max: 100, dec: 0 }),
//       category: faker.commerce.department(),
//       createdAt: new Date(faker.date.past()),
//       updatedAt: new Date(faker.date.recent()),
//       __v: 0,
//     };

//     products.push(product);
//   }

//   await Product.create(products);

//   console.log({ succecss: true });
// };

// const deleteRandomsProducts = async (count: number = 10) => {
//   const products = await Product.find({}).skip(2);

//   for (let i = 0; i < products.length; i++) {
//     const product = products[i];
//     await product.deleteOne();
//   }

//   console.log({ succecss: true });
// };
