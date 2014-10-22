// This module provides the APIs for Badminton statistics

// Standard and third-party module dependency
var joi 			 = require ('joi');
var uuid 			 = require ('uuid');
var redis			 = require ('redis');
var async			 = require ('async');

// Custom module dependency
var sgCommons 		 = require ("../../Common.js");
var mongostats		 = require ("../../Mongo/MongoStats.js");
var config 			 = require ("../../Config.js");

//Variables
var sgApp 			 = sgCommons.sgApp;
var me 				 = this;
var badmintonCollection = sgCommons.badmintonCollection;

// Define a new Class for Badminton
// In case any functionality from SportsBase has to be overridden, it has to be done by 
//							redefining in the scope of this class

var Badminton 			 = function (sport, categories, collection) {
	RacquetSportsBase.call (this, sport, categories, collection);
}
Badminton.prototype 	 = Object.create(RacquetSportsBase.prototype);

// create a instance of this class
var badmintonSport 	 = new Badminton("Badminton", ['singles', 'doubles'], badmintonCollection);


/**
 * @api {put} /player/:playerid/sport/badminton/stats 		Add new Badminton match statistics
 * @apiName Add new Badminton Stats
 * @apiGroup Player Statistics
 *
 * @apiDescription 	This API allows to add new Badminton match statistics for a player. 
 					The same API will create the match for both player and opponent (as well as partner in case of doubles)
 *
 * @apiParam 	{String} 	:playerid					Id of the player for whom the stastics needs to be created
 * @apiParam    {Object}  	{		 
 * @apiParam 	{Object} 	{.stats						Statistics 
 * @apiParam 	{String} 	{.stats.category			'singles', 'doubles', 'mixed'
 * @apiParam 	{String} 	{.stats.date				Date on which match was played 
 * @apiParam 	{String} 	{.stats.partner				player public id of partner (in case of double or mixed doubles) 	
 * @apiParam 	{String} 	{.stats.opponent			player public id of opponent
 * @apiParam 	{String} 	{.stats.opponent2			player public id of opponent2 (in case of double or mixed doubles)
 * @apiParam 	{String} 	{.stats.matchscore			final match score
 * @apiParam 	{String} 	{.stats.result				won, lost, tie, nr 
 * @apiParam 	{String} 	{.stats.notes				Any comments/notes 	
 * @apiParam 	{Object[]} 	{.stats.games				Game details 
 * @apiParam 	{String} 	{.stats.games.gamescore		Game score
 * @apiParam 	{String} 	{.stats.games.time			Playing time for this Game  
 * @apiParam 	}
 *
 * @apiSuccess 	{Object}  	Empty 	Empty Object
 *
 *
 */
// Create a match stat
sgApp.put('/player/:playerid/sport/badminton/stats', function(req, res){


	// Validate incoming data through Joi
	// Define schema
	var schema =  	{
						stats : joi.object(
						{
							category		: joi.string().required().valid('singles', 'doubles'),
							date 			: joi.date().required(),
							partner			: joi.object(
									{
										id  		: joi.any().required(),
										isExternal 	: joi.boolean()
									}).optional(),

							opponent		: joi.object(
									{
										id  		: joi.any().required(),
										isExternal 	: joi.boolean()
									}).required(),

							opponent2		: joi.object(
									{
										id  		: joi.any().required(),
										isExternal 	: joi.boolean()
									}).optional(),							matchscore		: joi.string().required(),  // can be a regex
							result			:  joi.string().required().valid('won', 'lost', 'tie', 'nr'),
							notes			: joi.string().optional().max(500),
							games			:  joi.array().includes(joi.object(
								{	
									gamescore 		: joi.string().required(),
									time			: joi.number().optional().min(0)
								}).required()).required()
						}).required()
					}

	// Validate input request body with the schema
	var schemaErr = joi.validate(req.body, schema, {'abortEarly' : false});

	// If error
	if (schemaErr && schemaErr.error){
		sgCommons.sgEvent.emit ('jojobu.error.455', jError.formatJoiValidationErrors(schemaErr), res);					
	}
	else
	{

		badmintonSport.checkifPlayersAreValid (req.params.playerid, req.body.stats, function (err, result){

			if (err){
				sgCommons.sgEvent.emit ('jojobu.error.455', {}, res);
			}
			else if (result){							
				// create a match id
				req.body.stats.matchid = uuid.v4();

				badmintonSport.addMatchForPlayers (req.params.playerid, req.body.stats.category, req.body.stats, prepareBadmintonMatchDetails, reverseStats, res,  function(addStatError){

					if (addStatError)
					{
						sgCommons.sgEvent.emit ('jojobu.error.455', {}, res);
					}
					else
					{
						jUtil.sendSuccessResponse ({}, res);
					}
				})

			}
			else{
				var err = jError.createCustomErrorMessage('One or more of Player ids are not correct', 7001)
				 sgCommons.sgEvent.emit ('jojobu.error.456', err, res);													
			}
		});		
	}

});