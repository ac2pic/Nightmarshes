ig.module("nightmarsh")
  .requires("game.feature.party.entities.party-member-entity",
	    "game.feature.puzzle.entities.push-pull-block").defines(()=>{
// deps: "game.feature.party.entities.party-member-entity"
sc.PartyMemberEntity.extend({
	
	
});

/*
// boxes
"game.feature.puzzle.components.push-pullable"
sc.PushPullable

"game.feature.interact.gui.interact-gui"
defines interaction button popups
need to register them into sc.MapInteract

also, PushPullBlock
*/

const stolenInteractIcons = {
	vertical:new sc.MapInteractIcon(new ig.TileSheet("media/gui/map-icon.png",24,24),{FOCUS:[40,41,42,41],NEAR:[43],RUNNING:[46,47]},0.2),
	horizontal:new sc.MapInteractIcon(new ig.TileSheet("media/gui/map-icon.png",24,24),{FOCUS:[40,41,42,41],NEAR:[43],RUNNING:[44,45]},0.2)
};

const MOVE_INCREMENT = 4;
const MultiplayerPushable = ig.Class.extend({
	// used by mapInteract
	entity: null,
	interactEntry: null,
	users: [], // player always first
	finalPos: null,
	timer: null,
	navBlocker: null,
	awaitingPlacement: false,
	init:function(entity) {
		this.entity = entity;
		this.navBlocker = ig.navigation.getNavBlock(entity);
	},
	// PushPullBlock: active mean it can be moved.
	setActive: function(yesorno) {
		if (!yesorno && this.interactEntry) {
			sc.mapInteract.removeEntry(this.interactEntry);
			this.interactEntry = null;
			this.users.slice().forEach(this.removeUser.bind(this));
		} else if (yesorno && !this.interactEntry) {
			const icons = stolenInteractIcons;
			const zcond = sc.INTERACT_Z_CONDITION;
			let inter = new sc.MapInteractEntry(this.entity,
							    this /* handler*/,
							    icons.horizontal,
							    zcond.SAME_Z,
							    /* interrupting*/
							    false);
			this.interactEntry = inter;
			sc.mapInteract.addEntry(inter);
		}
	},
	isActive: function() {
		return this.interactEntry !== null;
	},

	// idiot clicked on map interaction, sc.MapInteract
	onInteraction: function() {
		this.addAndMoveUser(ig.game.playerEntity);
	},
	// apparently called when the user leaves the mouse button,
	// except i don't know how the leave event happens.
	onInteractionEnd: function() {
		// FIXME
		this.removeUser(ig.game.playerEntity);
	},
	// user has been forced out of interacting, e.g. was punched in the face
	onInteractObjectDrop: function() {
		const player = ig.game.playerEntity;
		// why would we set it to true ?
		// player.coll.ignoreCollision = false;

		// why ?
		if (player.coll.pos.z - player.coll.baseZPos >= 1)
			player.setPos(undefined, undefined,
				      player.coll.baseZPos);
		// this.entity.coll.groundSlip = false ?
		player.cancelInteract();
		this.removeUser(player);
		player.animationFixed = false;
	},
	// still sc.MapInteract
	isInteractionBlocked: function() {
		const userpos = Vec2.create();
		if (this.usedByPlayer())
			return false; // don't block if using.
		const player = ig.game.playerEntity;
		const dir = this.getDirectionFromPos(player);
		const possible = this.getDirectionRestriction();
		if (!this.directionCompatible(dir, possible))
			// wrong dir.
			return true;
		const whatever = {};
		const trace = ig.game.physics.initTraceResult({});

		const dest_pos = this.basePosFromDirection(dir, player);
		Vec2.add(dest_pos, this.entity.coll.pos);
		// now, dest_pos is rough destination pos
		Vec2.sub(dest_pos, player.getCenter());
		// now dest_pos is a vector.
		let not_accessible
			= ig.game.traceEntity(trace, player,
					      dest_pos.x, dest_pos.y,
				              0, 0,
					      ig.COLLISION.HEIGHT_TOLERATE,
					      ig.COLLTYPE.VIRTUAL);

		return not_accessible;
	},
	addAndMoveUser : function(entity, direction) {
		if (!direction)
			direction = this.getDirectionFromPos(entity);
		const userentry = this.addUser(direction, entity);
		if (!userentry)
			return;

		const userpos = Vec2.create(this.entity.coll.pos);
		Vec2.add(userpos, userentry.relpos);


		const actions
			= new ig.Action("gripmultiblock",
					[{type:"MOVE_TO_POINT",
					  target:userpos,
					  precise: false},
					 {type:"SET_FACE",
					  face: direction},
					 {type:"SHOW_ANIMATION",
					  anim:"gripStand"}]);
		entity.setAction(actions,true);
	},
	getDirectionFromPos : function(entity) {
		const userpos = Vec2.create();
		let user_pos = entity.getCenter(userpos);
		const ourpos = Vec2.create();
		this.entity.getCenter(ourpos);
		user_pos = Vec2.sub(user_pos, ourpos);
		if (Math.abs(user_pos.x) > Math.abs(user_pos.y))
			return user_pos.x < 0 ? "EAST" : "WEST";
		else
			return user_pos.y < 0 ? "SOUTH": "NORTH";
	},
	usedByPlayer: function() {
		return this.users[0] === ig.game.playerEntity;
	},
	addUser: function(grip_direction, entity) {
		// grip_direction: NORTH SOUTH EAST WEST
		const entry = {entity: entity, dir: grip_direction,
			       relpos: Vec2.create(),
			       force: Vec2.create()};
		if (entity === ig.game.playerEntity)
			this.users.unshift(entry);
		else
			this.users.push(entry);
		if (this.users.length > 2)
			this.setActive(false);
		this.updatePositions();

		if (entity === ig.game.playerEntity)
			// This blocks control, but where are the controls ?
			entity.interactObject = this;

		return entry;
	},
	removeUser: function(entity) {
		const match = x => x.entity === entity;
		const index = this.users.findIndex(match);
		if (index === -1) {
			console.warn("non-existent entity removed");
			return;
		}
		const removed = this.users.splice(index, 1);
		if (this.users.length <= 2)
			this.setActive(true);
		this.updatePositions();

		if (entity === ig.game.playerEntity)
			// regain control to player.
			entity.interactObject = null;
		if (entity.hasAction())
			entity.cancelAction();
	},
	directionToRestriction: function(face) {
		switch (face) {
		case "WEST":
		case "EAST":
			return sc.PUSH_PULL_DIRECTION.LEFT_RIGHT;
		case "NORTH":
		case "SOUTH":
			return sc.PUSH_PULL_DIRECTION.UP_DOWN;
		}
	},
	directionCompatible: function(face, possible_dirs) {
		if (possible_dirs == sc.PUSH_PULL_DIRECTION.ALL)
			return true;
		const restriction = this.directionToRestriction(face);
		return possible_dirs === restriction;
	},
	getDirectionRestriction : function() {
		const reductor = (possible, user) => {
			let ret = this.directionToRestriction(user.dir);
			console.assert(this.directionCompatible(user.dir,
								possible));
			return ret;
		};

		return this.users.reduce(reductor,
					 this.entity.pushPullDirection);
	},
	dirToOffset: function(direction, amountX, amountY) {
		if (amountX === undefined)
			amountX = 1;
		if (amountY === undefined)
			amountY = amountX;
		switch (direction) {
		case "EAST": return { x: amountX, y: 0};
		case "WEST": return { x: -amountX, y: 0};
		case "SOUTH": return { x: 0, y: amountY};
		case "NORTH": return { x: 0, y: -amountY};
		}
		return null;
	},
	// get relative position of a would-be lone user. 
	basePosFromDirection: function(direction, entity) {
		const usersize = entity.coll.size;
		const pushablesize = this.entity.coll.size;

		// center of box to center of user.
		const xshift = usersize.x/2 + pushablesize.x/2;
		const yshift = usersize.y/2 + pushablesize.y/2;

		// from box topleft to box center: + pushablesize/2
		// from box center to user center:
		const ret = this.dirToOffset(direction, -xshift, -yshift);
		// from user center to user topleft: -usersize.x/2
		// but we don't apply it here.
		Vec2.addC(ret,
			  pushablesize.x / 2,
			  pushablesize.y / 2);
		return ret;
	},
	// assumes two users limit.
	updatePositions : function() {
		let sideshift = {x:0, y:0};
		if (this.users.length === 2
		    && this.users[0].dir === this.users[1].dir) {
			// assume the first user has correct size.
			const size = this.users[0].entity.coll.size;
			if (this.directionToRestriction(this.users[0].dir)
			    == sc.PUSH_PULL_DIRECTION.LEFT_RIGHT)
				sideshift.y = size.y/2;
			else
				sideshift.x = size.x/2;
		}

		this.users.forEach((user, index) => {
			const factor = index ? 1 : -1;
			const rel
				= this.basePosFromDirection(user.dir,
							    user.entity);
			if (index)
				Vec2.add(rel, sideshift);
			else
				Vec2.sub(rel, sideshift);

			user.relpos = rel;
		});
	},
	updateForces: function() {
		let force = Vec2.create();
		this.users.forEach((user) => {
			if (ig.game.playerEntity.hasAction())
				return;
			if (user.entity == ig.game.playerEntity) {
				sc.control.moveDir(user.force, 1);
			} else {
				// TODO: IAs
				user.force.x = user.force.y = 0;
			}

			let face = this.dirToOffset(user.dir);
			if (face.y == 0)
				user.force.y = 0;
			else
				user.force.x = 0;
			Vec2.add(force, user.force);
		});
		return force;
	},
	// need to be called when box is not moving
	canMoveBox: function(amount) {
		const trace = ig.game.physics.initTraceResult({});
		let ret = true;
		const restore_collision = [];
		const temporarily_disable_collision = entity => {
			restore_collision.push(entity);
			entity.coll.ignoreCollision = true;
		};
		this.users.forEach(user => {
			if (user.entity.hasAction())
				// not participating.
				return;
			if (Vec2.dot(amount, this.dirToOffset(user.dir)) >= 0)
				// pushing
				return;
			// someone is pulling
			temporarily_disable_collision(user.entity);

			if (ig.game.traceEntity(trace, user.entity,
						amount.x, amount.y,
						0, 0,
						ig.COLLISION.HEIGHT_TOLERATE,
						ig.COLLTYPE.BLOCK))
				ret = false;
		});
		if (ret && ig.game.traceEntity(trace, this.entity,
						amount.x, amount.y,
						0, 0, 1,
						ig.COLLTYPE.BLOCK))
			ret = false;
		restore_collision.forEach(entity =>
			entity.coll.ignoreCollision = false);
		return ret;
	},
	setPositionsOfEverything: function(position, final_pos) {
		const move = Vec2.create();
		Vec2.assign(move, position);
		Vec2.sub(move, this.entity.coll.pos);

		const userpos = Vec2.create();
		this.users.forEach(user => {
			if (user.entity.hasAction())
				return;
			Vec2.assign(userpos, this.entity.coll.pos);
			Vec2.add(userpos, user.relpos);
			// userpos: old ideal center position
			// lerp that with the current center position.
			// 0: ideal, 1: never ideal
			Vec2.lerp(userpos, user.entity.getCenter(), 0.5);

			// now advance that to new position
			Vec2.add(userpos, move);
			// finally, convert to top-left coord
			Vec2.subC(userpos,
				  user.entity.coll.size.x/2,
				  user.entity.coll.size.y/2);

			user.entity.setPos(userpos.x, userpos.y,
					   this.entity.coll.pos.z);
		});

		this.entity.setPos(position.x, position.y);

		const new_pos = move; // treat as uninitialized.
		if (final_pos) {
			if (this.navBlocker)
				this.navBlocker.update();
			const ground
				= ig.EntityTools.getGroundEntity(this.entity);
			if (!ground)
				return true;
			if (this.awaitingPlacement) {
				this.awaitingPlacement = false;
				ground.onPushPullablePlaced(this.entity);
				return false;
			} else if (ground.onPushPullableDetect
				   && ground.onPushPullableDetect(this.entity,
								  new_pos)) {
				this.finalPos = new_pos;
				this.setActive(false);
				this.awaitingPlacement = true;
				return false;
			}
		}
		return true;
	},
	getNextFinalPosition(force, increment) {
		// increment must be a multiple of MOVE_INCREMENT.
		// might double it for more users ? as it influence momentum
		let ret = Vec2.create();
		if (force.x == 0)
			ret.y = force.y > 0 ? increment : -increment;
		else
			ret.x = force.x > 0 ? increment : -increment;
		const round_me
			= x => Math.round(x / MOVE_INCREMENT) * MOVE_INCREMENT;
		const current_pos = this.entity.coll.pos;
		Vec2.addC(ret,
			  round_me(current_pos.x),
			  round_me(current_pos.y));
		return ret;
	},
	moveBox: function(force) {
		if (this.finalPos !== null) {
			// continue moving the box
			const base_speed = 100 * ig.system.tick;
			const left_to_move = Vec2.create(this.finalPos);
			Vec2.sub(left_to_move, this.entity.coll.pos);

			const dist_left = Vec2.length(left_to_move);
			const force_length = Vec2.length(force);
			const step = force_length.limit(0.75,2) * base_speed;
			if (dist_left <= step) {
				const final_pos = this.finalPos;
				this.finalPos = null;
				// may reset the final position in some weird
				// cases.
				this.setPositionsOfEverything(final_pos, true);
				// consume the force
				Vec2.length(force,
					    (1-(dist_left / step)).limit(0,1));
			} else {
				// not enough force for final pos.
				Vec2.length(left_to_move, step);
				Vec2.add(left_to_move, this.entity.coll.pos);
				this.setPositionsOfEverything(left_to_move);
			}
		}
		if (this.finalPos !== null)
			return true;
		if (force.x || force.y) {
			// start moving the box
			this.finalPos
				= this.getNextFinalPosition(force,
							    MOVE_INCREMENT);
			const move = Vec2.create(this.finalPos);
			Vec2.sub(move, this.entity.coll.pos);
			if (!this.canMoveBox(move)) {
				this.finalPos = null;
				return false;
			} else
				// move us with the remaining force
				return this.moveBox(force);
		} else
			// need the lerp when not doing anything
			this.setPositionsOfEverything(this.entity.coll.pos);
		return true;
	},
	updateUserAnims: function(force, blocked) {
		this.users.forEach(user => {
			let face = this.dirToOffset(user.dir);
			let grip_consider = 0;
			if (face.y == 0)
				grip_consider = force.x * face.x;
			else
				grip_consider = force.y * face.y;
			if (grip_consider === 0 || blocked)
				user.anim = "gripStand";
			else if (grip_consider > 0)
				user.anim = "gripPush";
			else
				user.anim = "gripPull";
			// could add some anims like gripPushBlocked,
			// which would be the first frame of gripPush or
			// something
			user.entity.setCurrentAnim(user.anim);
		});
	},
	// PushPullBlock.update
	onUpdate: function() {
		let i = 0;
		let force = this.updateForces();
		let blocked = !this.moveBox(force);
		this.updateUserAnims(force, blocked);
	},
	// PushPullBlock.deferredUpdate
	onDeferredUpdate: function() {
		// what to do here ?
		// console.log("TODO2");
	},
	onKill: function() {
		console.log("TODO3");
	},
	resetPos: function(pos, instant) {
		if (this.isActive() && pos) {
			this.entity.setPos(pos.x, pos.y, pos.z);
		}
	}
});

ig.ENTITY.MultiplayerPushBlock = ig.ENTITY.PushPullBlock.extend({
	init: function(x, y, z, attributes) {
		this.parent(x, y, z, attributes);
		this.pushPullable = new MultiplayerPushable(this);
	}
});

})
