import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";



import { ConfigService } from "@nestjs/config";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { User } from "src/users/entities/user.entity";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

@Injectable()
export class JwtStrategy extends PassportStrategy( Strategy ) {

    constructor( 
            configService: ConfigService,
            @InjectModel('User') private readonly userModel: Model<User>,
        ) {
        super({
            secretOrKey: configService.get('JWT_SECRET'),
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken()
        });
    }


    async validate( payload: JwtPayload ): Promise<User> {
        
        const { _id } = payload;
        const user = await this.userModel.findById(_id).exec();
        
        if (!user) {
            throw new UnauthorizedException('Token no valid');
        }
        if (!user.isActived) {
            throw new UnauthorizedException('User is not active, please talk to the administrator');
        }
        return user;
    }
}