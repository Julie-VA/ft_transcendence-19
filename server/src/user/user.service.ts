import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Blocklist, Game, Subscription, User} from '../typeorm/';
import { UserDetails, Ranking } from '../utils/types';
import { Repository } from 'typeorm';

@Injectable()
export class UserService {
	constructor(
		@InjectRepository(User) private readonly userRepo: Repository<User>,
		@InjectRepository(Game) private readonly gameRepo: Repository<Game>,
		@InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
		@InjectRepository(Blocklist) private readonly blockRepo: Repository<Blocklist>,
	) {}

	async updateOne(details: UserDetails) {
		const { intraId } = details;
		const user = await this.userRepo.findOne({
			where: {
				intraId: intraId,
			}
		});
		if (user) {
			this.userRepo.update({ intraId }, details);
		}
	}

	findUserByUsername(username: string): Promise<User | undefined> {
		return this.userRepo.findOne({
			where: {
				username: username,
			},
		});
	}

	findUserById(id: number): Promise<User | undefined> {
		return this.userRepo.findOneBy({ id: id });
	}

	async findMatches(id : number) {
		const player_1_games = await this.gameRepo.createQueryBuilder('game')
			.leftJoinAndSelect('game.player_1', 'player_1')
			.leftJoinAndSelect('game.player_2', 'player_2')
			.where('game.player_1 = :id OR game.player_2 = :id', { id: id })
			.getMany()
		return player_1_games;
	}

	async findLeader() {
		let ret: Ranking[] = [];
		const exist = await this.gameRepo.find();
		if (!exist )
			return ret;

		const games = await this.gameRepo.createQueryBuilder('game')
			.leftJoinAndSelect('game.player_1', 'player_1')
			.leftJoinAndSelect('game.player_2', 'player_2')
			.getMany()

		let leaderBoard = new Map<string, Ranking>();
		for (let i = 0; i < games.length; i++)
		{
			leaderBoard.set(games[i].player_1.intraId, {user: games[i].player_1, victories: 0, losses: 0, ratio: 0});
			leaderBoard.set(games[i].player_2.intraId, {user: games[i].player_2, victories: 0, losses: 0, ratio: 0});
		}

		for (let i = 0; i < games.length; i++)
		{
			if (games[i].player_1_score > games[i].player_2_score)
			{
				let tmp_vict : number = leaderBoard.get(games[i].player_1.intraId).victories;
				let tmp_los : number = leaderBoard.get(games[i].player_1.intraId).losses;
				tmp_vict ++ ;
				leaderBoard.set(games[i].player_1.intraId, {user: games[i].player_1, victories: tmp_vict, losses: tmp_los, ratio: 0} );

				tmp_vict = leaderBoard.get(games[i].player_2.intraId).victories;
				tmp_los = leaderBoard.get(games[i].player_2.intraId).losses;
				tmp_los ++ ;
				leaderBoard.set(games[i].player_2.intraId, {user: games[i].player_2, victories: tmp_vict, losses: tmp_los, ratio: 0} );
			}
			if (games[i].player_2_score > games[i].player_1_score)
			{
				let tmp_vict : number = leaderBoard.get(games[i].player_2.intraId).victories;
				let tmp_los : number = leaderBoard.get(games[i].player_2.intraId).losses;
				tmp_vict ++ ;
				leaderBoard.set(games[i].player_2.intraId, {user: games[i].player_2, victories: tmp_vict, losses: tmp_los, ratio: 0} );

				tmp_vict = leaderBoard.get(games[i].player_1.intraId).victories;
				tmp_los = leaderBoard.get(games[i].player_1.intraId).losses;
				tmp_los ++ ;
				leaderBoard.set(games[i].player_1.intraId, {user: games[i].player_1, victories: tmp_vict, losses: tmp_los, ratio: 0} );
			}
		}

		leaderBoard.forEach((value) => {
			let rat = value.losses == 0 && value.victories > 0 ? ((value.victories / 1)) : ((value.victories / value.losses));
			let tmp : Ranking = {user : value.user, victories : value.victories, losses : value.losses, ratio: rat};
			ret.push(tmp);
		});

		return ret;
	}

	async addFriend(userId: number, friendUserId: number) {
		const sub = this.subRepo.create();
		sub.subscriber = await this.userRepo.findOneBy({ id: userId });
		sub.subscribedTo = await this.userRepo.findOneBy({ id: friendUserId });
		await this.subRepo.save(sub);
	}

	async removeFriend(userId: number, friendUserId: number) {
		await this.subRepo.createQueryBuilder('subscription')
			.leftJoinAndSelect('subscription.subscriber', 'subscriber')
			.leftJoinAndSelect('subscription.subscribedTo', 'subscribedTo')
			.delete()
			.from(Subscription)
			.where('subscriber.id = :userId AND subscribedTo.id = :friendUserId', { userId, friendUserId})
			.execute()
	}

	async getFriends(userId: number) {
		const subscriptions = await this.subRepo.createQueryBuilder('subscription')
			.leftJoinAndSelect('subscription.subscriber', 'subscriber')
			.leftJoinAndSelect('subscription.subscribedTo', 'subscribedTo')
			.where('subscriber.id = :id', { id: userId })
			.getMany()

		return subscriptions;
	}

	async isFriend(userId: number, friendId: number) {
		const result = await this.subRepo.createQueryBuilder('subscription')
			.leftJoinAndSelect('subscription.subscriber', 'subscriber')
			.leftJoinAndSelect('subscription.subscribedTo', 'subscribedTo')
			.where('subscriber.id = :userId AND subscribedTo.id = :friendId', { userId, friendId})
			.getOne();
		
		return result !== null;
	}

	async blockUser(userId: number, blockeeId: number) {
		const block = this.blockRepo.create();
		block.blocker = await this.userRepo.findOneBy({ id: userId });
		block.blockee = await this.userRepo.findOneBy({ id: blockeeId });
		await this.blockRepo.save(block);
	}

	async unblockUser(userId: number, blockeeId: number) {
		await this.blockRepo.createQueryBuilder('blocklist')
			.leftJoinAndSelect('blocklist.blocker', 'blocker')
			.leftJoinAndSelect('blocklist.blockee', 'blockee')
			.delete()
			.from(Blocklist)
			.where('blocker.id = :userId AND blockee.id = :blockeeId', { userId, blockeeId})
			.execute()
	}

	async isBlocked(userId: number, blockeeId: number) {
		const result = await this.blockRepo.createQueryBuilder('blocklist')
			.leftJoinAndSelect('blocklist.blocker', 'blocker')
			.leftJoinAndSelect('blocklist.blockee', 'blockee')
			.where('blocker.id = :userId AND blockee.id = :blockeeId', { userId, blockeeId})
			.getOne();
		
		return result !== null;
	}

	async complete(query: string) {
		const result = await this.userRepo.createQueryBuilder()
			.where('username like :name', { name: `%${query}%` })
			.orWhere('LOWER(display_name) like LOWER(:displayName)', { displayName: `%${query}%` })
			.getMany();

			
		const usernames = result.map((user) => {
			return { username: user.username, photoURL: user.photoURL, displayName: user.displayName };
		});

		return usernames;
	}

	async setStatus(userId: number, status: 'online' | 'offline' | 'in_game') {
		const user = await this.userRepo.findOneBy({ id: userId });
		user.status = status;
		this.userRepo.save(user);
	}

	async setTwoFactorAuthenticationSecret(secret: string, userId: number) {
		return this.userRepo.update(userId, { twoFactorAuthenticationSecret: secret });
	}

	async enableTwoFactorAuthentication(userId: number) {
		return this.userRepo.update(userId, { isTwoFactorAuthenticationEnabled: true, isSecondFactorAuthenticated: true });
	}

	async disableTwoFactorAuthentication(userId: number) {
		return this.userRepo.update(userId, { isTwoFactorAuthenticationEnabled: false, isSecondFactorAuthenticated: false, twoFactorAuthenticationSecret: null });
	}

	async secondFactorAuthenticate(userId: number, state: boolean) {
		return this.userRepo.update(userId, { isSecondFactorAuthenticated: state });
	}

	async addSocketId(user_id: number, socketId: string) {
		return this.userRepo.update(user_id, { socketId });
	}
	
	async findUserBySocketId(socketId: string) : Promise<User | undefined> {
		return this.userRepo.findOneBy({ socketId });
	}
}
