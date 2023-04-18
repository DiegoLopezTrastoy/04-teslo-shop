import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException, Delete } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Product, ProductImage } from './entities';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { isUUID } from 'class-validator';

@Injectable()
export class ProductsService {

  private readonly logger = new Logger('ProductsService');

  constructor(

    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,

    @InjectRepository(ProductImage)
    private readonly productImageRepository: Repository<ProductImage>,

    private readonly dataSource: DataSource,
  ) { }

  async create(createProductDto: CreateProductDto) {

    try {

      const {images = [], ...productDetails} = createProductDto;

      const product = this.productRepository.create({
                                ...productDetails, 
                                images: images.map(
                                  image => this.productImageRepository
                                                  .create({url: image}))
                      });
      await this.productRepository.save(product);

      return {...product, images};

    } catch (error) {
      this.handleDBExceptions(error);
    }

  }

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;
    const products = await this.productRepository.find({
      take: limit,
      skip: offset,
      relations: {
        images: true
      }
    });

    return products.map( ({images, ...rest}) => ({
      ...rest, 
      images: images.map(img => img.url)
    }))

  }

  async findOne(term: string) {

    let producto: Product;

    if (isUUID(term)) {
      producto = await this.productRepository.findOneBy({ id: term });
    } else {
      // producto = await this.productRepository.findOneBy({ slug: term });
      const queryBuilder = this.productRepository.createQueryBuilder('prod');
      producto = await queryBuilder.where(`LOWER(title)= :title or LOWER(slug)= :slug`, { title: term.toLowerCase(), slug: term.toLowerCase() }).leftJoinAndSelect('prod.images', 'prodImages').getOne();
    }
    // producto = await this.productRepository.findOneBy({term});
    if (!producto) {
      throw new NotFoundException(`Producto with term ${term} not found`)
    }
    return producto;
  }

  async remove(id: string) {
    await this.productRepository.delete(id);
  }

  async findOnePlain(term: string) {
    const {images = [], ...rest} = await this.findOne(term);
    return {...rest, images: images.map(img => img.url)};
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    const {images, ...productDetails} = updateProductDto;
    const product = await this.productRepository.preload({
      id,
      ...productDetails,
      });

    if (!product) {
      throw new NotFoundException(`Product with id: ${id} not found`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();


    try {

      if (images) {
        await queryRunner.manager.delete(ProductImage, {product: {id}})
        product.images = images.map(image => this.productImageRepository.create({url: image}))
      }

      await queryRunner.manager.save(product);

      // await this.productRepository.save(product);

      await queryRunner.commitTransaction();
      await queryRunner.release();

      return this.findOnePlain(id);
    } catch (error) {

      await queryRunner.rollbackTransaction();
      await queryRunner.release();

      this.handleDBExceptions(error);
    }


  }

  private handleDBExceptions(error: any) {

    if (error.code === '23505') {
      throw new BadRequestException(error.detail);
    }

    this.logger.error(error);
    throw new InternalServerErrorException('Unespected error, check server logs');

  }

  async deleteAllProducts() {
    const query = this.productRepository.createQueryBuilder('product');

    try {
      return await query.delete().where({}).execute();
      
    } catch (error) {
      this.handleDBExceptions(error)
    }

  }

}
