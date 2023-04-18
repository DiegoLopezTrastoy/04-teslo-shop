import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { NotFoundError } from 'rxjs';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { isUUID } from 'class-validator';

@Injectable()
export class ProductsService {

  private readonly logger = new Logger('ProductsService');

  constructor(

    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,

  ) { }

  async create(createProductDto: CreateProductDto) {

    try {

      const product = this.productRepository.create(createProductDto);
      await this.productRepository.save(product);

      return product;

    } catch (error) {
      this.handleDBExceptions(error);
    }

  }

  findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;
    return this.productRepository.find({
      take: limit,
      skip: offset,
    });

  }

  async findOne(term: string) {

    let producto: Product;

    if (isUUID(term)) {
      producto = await this.productRepository.findOneBy({ id: term });
    } else {
      // producto = await this.productRepository.findOneBy({ slug: term });
      const queryBuilder = this.productRepository.createQueryBuilder();
      producto = await queryBuilder.where(`LOWER(title)= :title or LOWER(slug)= :slug`, { title: term.toLowerCase(), slug: term.toLowerCase() }).getOne();
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

  async update(id: string, updateProductDto: UpdateProductDto) {
    
    const product = await this.productRepository.preload({
      id,
      ...updateProductDto
    });

    if (!product) {
      throw new NotFoundException(`Product with id: ${id} not found`);
    }

    try {
      await this.productRepository.save(product);
      return product;
    } catch (error) {
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
}
