// This module acts as the  base class for Sports

// Standard and third-party module dependency
var uuid 			 = require ('uuid');
var async			 = require ('async');

// Custom module dependency
var sgCommons 		 = require ("../Common.js");
var mongo  			 = require ("../Mongo/Mongo.js");
var mongoSportStats	 = require ("../Mongo/MongoStats.js");
var config 			 = require ("../Config.js");
var jUtil 			 = require ("../Util/SgUtils.js");
var jError 			 = require ("../Util/Error.js");
var redisClient 	 = require ("../Redis/Redis.js");
var mongoSports		 = require ("../Mongo/MongoSports.js");


// Base class for all Sports
function SportsBase(sport, categories, collection){

	// constructor for Sports
	this.sport = sport;
	this.categories = categories;
	this.collection = collection;
};

SportsBase.prototype.getSport = function (){
	return this.sport;
}

SportsBase.prototype.setSport =  function (sport){
	this.sport = sport;
}

SportsBase.prototype.getCategories = function (){
	return this.categories;
}

SportsBase.prototype.setCategories =  function (categories){
	if (! categories instanceof Array)
		this.categories = [];	
	else{
		this.categories = categories;	
	}	
}

// Create an empty Statistic for an entity
SportsBase.prototype.createEmptySkeleton =  function (id){

	var stat 							= {};
	stat.category 						= {};
 	stat._id 							= parseInt(id);

 	for (var i = 0; i < this.categories.length; i++){

 		var category = this.categories[i];

 		stat.category[category] 			= {};
	 	stat.category[category].total		= 0;
	 	stat.category[category].won			= 0;
	 	stat.category[category].lost		= 0;
	 	stat.category[category].tie			= 0;
	 	stat.category[category].nr			= 0;
	 	stat.category[category].played		= [];
	 	stat.category[category].scheduled	= [];
 	}
	return stat;		
}	

// This method prepares the common attributes for a match
// common attributes - 
//    			Match ID
//				Statistics created date (different than match date)
//				Verification : always set to false
//				
SportsBase.prototype.addMatch =  function (entityId, category, stats, res, callback){

		var me = this;

		// In case this is the first stat player is adding, there is no record in Tennis collection for the player
		// First check if there is a record for the player already
		var playerStat;
		async.series(
			[
				function(fn1){
					mongoSportStats.checkEntity (this.collection, entityId,  function (mongoErr, stat){
						if (mongoErr){
							fn1 (mongoErr);							
						}
						else{
							playerStat = stat;
							fn1 (null);
						}
				},
				function(fn2){
					// player does not exist. construct the first document
					 if (!playerStat)
					 {
					 	mongoSportStats.createEmptyStat (me.collection, me.createEmptySkeleton (entityId),
					 		 function (mongoErr, stat){
					 		if (mongoErr){
					 			fn2 (mongoErr)
							}
							else{
									// Add details of the stats into DB
									mongoSportStats.addMatchStats (me.collection, entityId, category, stats,
										function (mongoErr2, result){
											if (mongoErr2){
												fn2 (mongoErr)												
											}
											else{
												fn2 (null);
											}
									});
							}
					 	});
					 }
					 // Not the first time. Just update and add the match stat
					 else
					 {
							// Add details of the stats into Mongo
							mongoSportStats.addMatchStats (me.collection, entityId, category, stats,
								function (mongoErr, result){

									if (mongoErr){
										//take action
										fn2 (mongoErr)
									}
									else{
										fn2 (null);
									}
							});
					 }					
				}
			],
			function (err, results){
				if (err)
					sgCommons.sgEvent.emit ('jojobu.error.456', jError.technicalError (err), res);
				else
					callback ();
			})
}

SportsBase.prototype.updateMatch =  function (entityId, matchId, callback){
	this.deleteMatch ();
	this.addMatch ();
}

SportsBase.prototype.deleteMatch =  function ( entityId, matchid, callback){		

	var me = this;
		// Now get the match stats
	mongoSportStats.fetchMatchStats (this.collection, entityId, matchid, function (mongoErr, matchStats){

		if (mongoErr){
			// Mongo Error
			callback ('jojobu.error.456', jError.formatMongoErrors (mongoErr), false);
		}
		else if (matchStats){		

			// Check the result of the match
			var matchResult =  matchStats.match.result;

			var category = 'category.' + matchStats.category;
			var total 	 = category + '.total';
			var lost 	 = category + '.lost';
			var nr 	 	 = category + '.nr';
			var tie 	 = category + '.tie';
			var won 	 = category + '.won';

			var upd = {}
			upd[total] = -1;
			upd[category + '.' + matchResult] = -1;

			var match  = {};
			match['matchid']	 = matchid;
			var delMatch = {}					
			delMatch[category + '.played'] = match;

			mongoSportStats.deleteMatch (me.collection, entityId, upd, delMatch, function(){
				callback (undefined, undefined, true);
			})

		}
		else{
			// Wrong match id
			var error = [];
			error.push ({'msg' : 'Match id \"' + matchid + '\" does not exist', 'code' : '5001'})
			error.formatted = true;
			callback ('jojobu.error.456', error, false);
		}

	})

}	

SportsBase.prototype.reverseMatchDetails =  function (){

}

SportsBase.prototype.getMatches =  function (){

}

SportsBase.prototype.getMatchDetails =  function (){

}

SportsBase.prototype.getMatchSummary =  function (req, res){

	var me = this;

	redisClient.isPlayer (req.params.playerid, function (redisClientErr, isPlayer){

		if (redisClientErr)
		{
			sgCommons.sgEvent.emit ('jojobu.error.455', {}, res);									
		}
		// player id invalid
		else if (!isPlayer){
			// Send a response with appropriate error message
			sgCommons.sgEvent.emit ('jojobu.error.456', jError.formatPlayerNotFoundError(req.params.playerid), res);													
		}
		// player id valid
		else if (isPlayer){
			mongoSportStats.fetchStats (me.collection, req.params.playerid, function (err, stats){
				if (stats)
				{
					for (var i=0; i < me.categories.length; i++){
						delete stats.category[me.categories[i]].played;
					}

					jUtil.sendSuccessResponse (stats, res);
				}					
				else
					jUtil.sendSuccessResponse ({}, res);
			})
		}
	});

}


// Static function
SportsBase.isSportValid =  function (sport, callback){
	mongoSports.getAllSports (function (errMongo, sports){

		for (var i=0; sports && i < sports.length; i++){
			if (sports[i]._id === sport){
				callback (true);		
				return;
			}
		}
		callback (false);				
	})	
}

// Static function
// Get categories for a sports
SportsBase.getCategory =  function (sport, callback){
	mongoSports.getCategoriesForSport (sport, function (errMongo, categories){
				callback (errMongo, categories);		
	})	
}

module.exports = SportsBase;
