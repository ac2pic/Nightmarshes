
ig.module("nightmarsh")
  .requires("game.feature.party.entities.party-member-entity",
	    "game.feature.puzzle.entities.push-pull-block",
	    "impact.base.game").defines(()=>{

// to be used as a nav destination
class FakeEntityForNav {
	constructor() {
		this.jumping = false;
		this.coll = { pos: {}, size: {x:0, y:0, z:0} };
		this.updatePos(0,0,0);
	}
	updatePos(x,y,z) {
		const pos = this.coll.pos;
		pos.x = position.x || 0; 
		pos.y = position.y || 0;
		pos.z = pos.baseZPos = position.z || 0;
	}

	getCenter(vector) {
		vector.x = this.coll.x;
		vector.y = this.coll.y;
	}
};

// deps: "game.feature.party.entities.party-member-entity"
let IASTATES = {
	GOTOBOX: {
		start: (me, box, targetStats, stateData)=>{
			//this.setDefaultConfig(this.configs.normal);
			me.updateDefaultConfig();

			stateData.realTarget = new FakeEntityForNav();
			const dir = nightmarsh.getPreferredDirectionForBox(box);
			const pos = box.getPosForUser(dir, me);
			stateData.realTarget.updatePos(pos.x, pos.y,
						       box.coll.pos.z)
			me.nav.path.toEntity(stateData.realTarget, 8);
		},
		update: (me, box, targetStats, stateData) => {
			me.updateDefaultConfig();
			if (!me.myTargetIsABox() || !me.hasValidTarget())
				return IASTATES.IDLE;

			const dir = nightmarsh.getPreferredDirectionForBox(box);
			if (!dir)
				return IASTATES.IDLE;
			const pos = box.getPosForUser(dir, me);
			const my_pos = me.getCenter({});
			if (Vec2.squareDistance(pos, my_pos) < 16*16)

			stateData.realTarget.updatePos(pos.x, pos.y,
						       box.coll.pos.z)

			// full speed ! onward to them boxen !
			me.nav.path.startRelativeVel = 1;
			if (me.nav.path.moveEntity())
				return IASTATES.MOVEBOX;
		}
	},
	MOVEBOX: {
		start: (me, box, targetStats, stateData) => {
			// REPEAT AFTER ME: DO NOT ADD ACTIONS TO THE ENTITY
			// if you do it, all states are dropped.
			// so you better move carefully to the point where
			// you go, instead of addAndMoveUser.
			box.pushPullable.addUser(me);
			// LET THE PUSH PULLING BEGINS !
			me.tryAnotherDirForBox = false;
		},
		update: (me, box, targetStat, stateData)=>{
			if (me.tryAnotherDirForBox) {
				me.tryAnotherDirForBox = false;
				const nm = ig.nightmarshPartyPush;
				const dir = nm.getPreferredDirectionForBox(box);
				if (dir)
					return IASTATES.GOTOBOX;
				else {
					// HACK HACK HACK
					// normally, we must return the
					// new default state, but we don't
					// have access to the state that we
					// want, so we change the state ourself
					// but we return nothing.  This
					// does the same.
					me.returnToDefaultState();
					return;
				}
			}
			// FIXME: we should be kicked from the box on stun
			// we should be kicked from the box on 
		}
	}
};

const requiredAnimations = ['gripStand', 'gripPush', 'gripPull'];

// idea: if under combat, then allow selectTarget to select boxes
// if not under combat, then regardless of state, just tell them to
// find some good boxes to push and stop on the next changeState.
sc.PartyMemberEntity.inject({
	init: function(...args) {
		this.parent.apply(this, args);
		// we always start in idle, so steal the idle state.
		IASTATES.IDLE=this.state;
		this.canPushBoxes = false;
		if (this.animSheet
		    && requiredAnimations.every(x =>
					      this.animSheet.hasAnimation(x))
		    && ig.nightmarshPartyPush.active)
			this.canPushBoxes = true;
		else
			return;

		this.mustChangeToMoveBox = false;
	},
	findBestBox: function() {
		const nightmarsh = ig.nightmarshPartyPush;
		var box = nightmarsh.getClosestUsefulBox(this.coll.pos);
		if (!box)
			return;
		// don't worry, things will work out fine...
		// most notably, this will remove the previous target
		// properly.
		this.setTarget(box);
		this.mustChangeToMoveBox = true;
	},
	myTargetIsABox: function() {
		return this.target instanceof ig.ENTITY.MultiplayerPushBlock;
	},
	hasValidTarget: function() {
		if (this.myTargetIsABox())
			return this.target.canBeTargetted();
		else
			return this.parent();
	},
	changeState: function(new_state) {
		if (this.myTargetIsABox()) {
			if (this.state === IASTATES.MOVEBOX)
				this.target.pushPullable.removeUser(this);
			if (this.mustChangeToMoveBox) {
				// normally, new_state is COMBAT_IDLE
				// but i can't check that reliably.
				new_state = IASTATES.GOTOBOX;
				this.mustChangeToMoveBox = false;
			}
		}
		this.parent(new_state);
	},
	maybeSelectBoxTarget: function() {
		// a target was selected a target, find out why.
		if (this.hasValidTarget() && this.target.annotate) {
			switch (this.target.annotate.passive) {
			case sc.ENEMY_ANNO_PASSIVE.VULNERABLE:
			case sc.ENEMY_ANNO_PASSIVE.WEAK:
				// the ennemy is weak or vulnerable.
				// the AI may have noticed it or it could be
				// luck, in any case, don't try to push them
				// boxes.
				return;
			}
			// it is probably chosen randomly.
			// let's add a bit of random
			// FIXME: should probably instead look at the number
			// of people targetting this one.
			if (Math.random() < 0.8) return;
		}
		this.findBestBox();
	},
	setTarget: function(new_target) {
		if (this.myTargetIsABox())
			this.target.pushPullable.removeUser(this);
		return this.parent(new_target);
	},
	// should not change the target is the current one is valid
	// this is only called when in combat
	selectTarget: function() {
		if (!this.canPushBoxes)
			return this.parent();

		var target_is_valid = this.hasValidTarget();
		this.parent();
		if (!target_is_valid)
			this.maybeSelectBoxTarget();
	},
	// could change the target, or drop the target entirely if the
	// current one is not valid.
	// this is only called when in combat
	reselectTarget: function() {
		this.parent();
		if (this.canPushBoxes)
			this.maybeSelectBoxTarget();
	},
	update: function() {
		this.parent();
		if (this.state !== IASTATES.MOVEBOX && this.myTargetIsABox())
			this.target.pushPullable.removeUser(this);

		if (!this.target) {
			this.maybeSelectBoxTarget();
			if (this.mustChangeToMoveBox)
				this.changeState(this.MOVEBOX);
		}
	},

	returnToDefaultState: function() {
		// this means, 'should we go to combat ?'
		if (this.goToCombat())
			this.startCombat();
		else
			this.endCombat();
	},

	/*
	startCombat: function() {
		this.parent();
		// calls selectTarget()
		// may call changeState(COMBAT_IDLE if target selected)
		if (this.inCombat)
			IASTATES.COMBAT_IDLE = this.state;
	},
	*/
	/*
	endCombat: function() {
		this.parent();
		// clears the target, change state to IDLE
		// may need to reselect a box here.
	},*/
	// we can't push/pull anymore
	notifyPushIsBlocked: function() {
		this.tryAnotherDirForBox = true;
	},
	// we are not applying any force (i.e. box is placed or on the right
	// coordinate)
	notifyNoForce: function() {
		this.tryAnotherDirForBox = true;
	}
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

const l1_distance = (a,b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// deps: impact.base.game
const PartyPushableOrganiser = ig.GameAddon.extend({
	boxes:[],
	dests:[],
	box_to_dest_plan: {},

	active: false,
	
	init: function() {
		this.parent();
	},
	onTeleport: function() {
		// that's more like leaving a map, right ?
		console.log("teleporting");
	},
	onLevelLoaded: function() {
		console.log("level loaded");
		this.findThemBoxes();
		console.log("boxes: ", this.boxes.length, this.dests.length);
	},
	recalculatePlans: function() {
		// if this sounds like an assignment problem, maybe it's because
		// it is. and i'm too lazy to implement a proper alg
		const dist_maps = [];
		this.dests.forEach((dest,destid) => {
			if (dest.placed)
				return;
			const dest_dists = [];
			this.boxes.forEach((box,boxid) => {
				if (box.isPlacedOnADest())
					return;
				var dista,ce = l1_distance(dest.coll.pos,
							   box.coll.pos);
				dest_dists.push({boxid, distance});
			});
			// sort them closest first.
			dest_dists.sort(entry=>entry.distance);

			dist_maps.push({destid, boxes: dest_dists});
		});
		const assigned_boxes = {};
		// now we have our cost matrix, let's use a greedy shit alg
		// that's probably n*m and does not find the best shit.
		// but if that's human enough, it should be good for an ai.
		while (dist_maps.length) {
			var best_destid = null;
			var best_boxid = null;
			var best_distance = Infinity;
			dist_maps.forEach(destentry => {
				var boxes = destentry.boxes;
				while (boxes[0].boxid in assigned_boxes)
					boxes.unshift();
				if (boxes[0].distance < best_distance) {
					best_destid = destentry.destid;
					best_boxid = boxes[0].boxid;
					best_distance = boxes[0].distance;
				}
			});

			assigned_boxes[best_boxid] = best_destid;
			dist_maps.splice(best_destid, 1);
		}
		this.box_to_dest_plan = assigned_boxes;
	},
	findThemBoxes: function() {
		var boxentype = ig.ENTITY.MultiplayerPushBlock;
		var desttype = ig.ENTITY.PushPullDest;
		this.boxes = ig.game.getEntitiesByType(boxentype);
		this.dests = ig.game.getEntitiesByType(desttype);
		this.boxes.forEach((box, i) => { box.organizer_id = i; });
		this.dests.forEach((dest, i) => { dest.organizer_id = i; });

		this.active = false;
		if (this.boxes.length == 0 || this.dests.length == 0)
			return;
		if (this.boxes < this.dests.length)
			// dude, your puzzle is like ... unsolvable ?
			return; // the alg is not prepared for that
		this.active = true;
		this.recalculatePlans();
	},
	getClosestUsefulBox: function(position) {
		let target = null;
		let smallest_distance = Infinity;
		this.boxes.forEach((box, boxid) => {
			if (!(boxid in this.box_to_dest_plan)
			    || !box.canBeTargetted())
				return;
			const dist = Vec2.squareDistance(position,
							 box.coll.pos);
			if (dist >= smallest_distance)
				return;

			// is it useful to move that box ?
			if (!this.getPreferredDirectionForBox(box))
				return;
			target = box;
			smallest_distance = dist;
		});
		return target;
	},
	getPreferredDirectionForBox: function(box) {
		var dest = this.box_to_dest_plan[box.organizer_id];
		if (!dest)
			return null;
		var dist = Vec2.sub(dest.coll.pos, box.coll.pos, {});
		// find the order in which to try the dirs.
		var directions_to_try = [];
		add_dirs = (principal, reverse, swap) => {
			if (swap) {
				const tmp = principal;
				principal = reverse;
				reverse = tmp;
			}
			if (!box.canMoveBoxInDirection(principal))
				// whatever face you choose, you can't move.
				return;

			directions_to_try.push(principal, reverse);
		};
		var try_x = add_dirs.bind(null, "EAST", "WEST", dist.x < 0);
		// fuck ads.
		var try_y = add_dirs.bind(null, "SOUTH", "NORTH", dist.y < 0);
		if (dist.x && dist.y) {
			// i think we should try the smallest distance first
			// this seems more natural
			if (Math.abs(dist.x) < Math.abs(dist.y)) {
				try_x();
				try_y();
			} else {
				try_y();
				try_x();
			}
		} else if (dist.x)
			try_x();
		else if (dist.y)
			try_y();

		for (let direction of directions_to_try) {
			if (box.faceAvailable(direction))
				return direction;
		}
		return null;
	},
	getIAForces: function(box, current_force) {
		var dest = this.box_to_dest_plan[box.organizer_id];
		if (!dest)
			return {x:0, y:0};
		var dist = Vec2.sub(dest.coll.pos, box.coll.pos, {});
		dist.x = dist.x.clamp(-1, 1);
		dist.y = dist.y.clamp(-1, 1);
		if (current_force) {
			// oppose the idiot player
			if (dist.x == 0 && current_force.x != 0)
				dist.x = -current_force.clamp(-1, 1);
			if (dist.y == 0 && current_force.y != 0)
				dist.y = -current_force.clamp(-1, 1);
		}
		return dist;
	},
	notifyBoxPlaced: function(box) {
		if (this.active)
			this.recalculatePlans();
	}
});
ig.addGameAddon(() => (ig.nightmarshPartyPush = new PartyPushableOrganiser()));




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
			if (user.entity.hasAction())
				return;
			if (user.entity == ig.game.playerEntity) {
				sc.control.moveDir(user.force, 1);
			} else {
				const nightmarsh = ig.nightmarshPartyPush;
				user.force = nightmarsh.getIAForces(box, force);
			}

			let face = this.dirToOffset(user.dir);
			if (face.y == 0)
				user.force.y = 0;
			else
				user.force.x = 0;
			if (user.force.x === 0 && user.force.y === 0
			    && user.entity.notifyNoForce)
				user.entity.notifyNoForce();
			Vec2.add(force, user.force);
		});
		return force;
	},
	// should only be used when a move increment is finished,
	// no need to use it while moving, unless for the IA.
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
	// this does not mean that a player can fit, or the box can be moved
	// in this dir, it just check for obvious obstacles.
	// this should only be used by the IA
	canMoveBoxInDirection: function(direction) {
		const offset = dirToOffset(direction, MOVE_INCREMENT);
		return this.canMoveBox(offset);
	},
	// Return true if there is a chance that this face can be used by an AI
	faceAvailable: function(direction) {
		const restriction = this.getDirectionRestriction();
		if (!this.directionCompatible(direction, restriction))
			return false;

		if (this.users.some(user => user.direction == direction))
			return true; // it's already used, so it should be ok
		
		// assume a player is 20 pixel wide, even if in practice, this
		// is is less than that.
		var offset = this.dirToOffset(direction, -20);

		// we don't need to hack up the ignoreCollision of users this
		// time.
		const trace = ig.game.physics.initTraceResult({});
		if (ig.game.traceEntity(trace, this.entity,
					offset.x, offset.y,
					0, 0, 1,
					ig.COLLTYPE.BLOCK))
			return false;
		// can't think of anything else for now.
		return true;
	},
	setPositionsOfUsers: function(position, final_pos) {
		const move = Vec2.create(position);
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
				ig.nightmarshPartyPush.notifyBoxPlaced(this);
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
				this.setPositionsOfUsers(final_pos, true);
				// consume the force
				Vec2.length(force,
					    (1-(dist_left / step)).limit(0,1));
			} else {
				// not enough force for final pos.
				Vec2.length(left_to_move, step);
				Vec2.add(left_to_move, this.entity.coll.pos);
				this.setPositionsOfUsers(left_to_move);
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
			}/* else
				// move us with the remaining force
				// except the IA is not prepared for this,
				// and will overshoot
				return this.moveBox(force);
			*/
		} else
			// need the lerp when not doing anything
			this.setPositionsOfUsers(this.entity.coll.pos);
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
		if (blocked)
			this.users.forEach(user => {
				if (user.entity.notifyPushIsBlocked)
					user.entity.notifyPushIsBlocked();
			});
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
	/* this should make EnemyAnno ignore us, except it will
	 * consider us as weak/immune/needdodge/... as a default
	 */
	annotate: false,

	init: function(x, y, z, attributes) {
		this.parent(x, y, z, attributes);
		this.pushPullable = new MultiplayerPushable(this);
		
		this.annotate = false;
	},
	isPlacedOnADest: function() {
		return this.pushPullable.awaitingPlacement;
	},
	canBeTargetted: function() {
		return this.pushPullable.isActive();
	},
	faceAvailable: function(direction) {
		return this.pushPullable.faceAvailable(direction);
	},
	canMoveBoxInDirection: function(direction) {
		return this.pushPullable.canMoveBoxInDirection(direction);
	},
	getPosForUser: function(direction, entity) {
		return this.pushPullable.basePosFromDirection(direction,
							      entity);
	}
});

})
