[00:00] What the fuck?  
[00:08] Oh shit, sorry.  
[00:10] No, no, I'm fine.  
[00:11] Can you hear me?  
[00:12] Yeah, I can hear you.  
[00:13] Is it fine?  
[00:14] Yeah, yeah, work away.  
[00:16] Okay, so in Dungeons & Dragons,  
[00:20] basically you're going to have usually a map of some kind  
[00:22] that players are going to be able to follow  
[00:24] to give some kind of context on what they're doing, okay?  
[00:27] Okay.  
[00:27] So in Roll20, which is a website designed to do Dungeons & Dragons online,  
[00:32] they give you apps, layers, tokens, player view versus game master view.  
[00:39] And I was like, well, I just need a more basic version of that  
[00:43] before I decide that I'm going to pay for it.  
[00:45] So I built this with Claude.  
[00:48] It has the features of random map generation, as you can see.  
[00:54] It has borders, pillars.  
[00:56] these are because these are light like so every there's meant to be a light source so this fire  
[01:02] here is a light source yeah okay so this whole thing is pitch black from the player's view  
[01:08] okay okay cool but if i put uh let's say a player here yeah i've got the token up so he's gonna  
[01:16] start here right uh he's called spider now okay player view as you can see it's still kind of  
[01:22] buggy it's all ai coded yeah um there's also a vision radius problem here which yeah it does  
[01:28] increase but it's it's still a bit busted um see the dark vision seems to then show you that he's  
[01:37] there when he's close to the wall you'll i'm sure you'll figure this out whenever you look at it or  
[01:41] put it into the thing but or if you have follow-up questions there's also another bug that i've found  
[01:47] that if I put it as a monster called spider two,  
[01:52] I put them over here.  
[01:54] See, he's just on that and the color should be,  
[01:57] see the color should have changed.  
[01:58] It's already a different color, but it's not.  
[02:01] Okay.  
[02:02] But you go to player view, they shouldn't see the spiders.  
[02:06] Okay.  
[02:07] Okay, the spiders shouldn't have a light source  
[02:09] or be able to viewable.  
[02:10] I should only see that and they should only be viewable  
[02:13] once the player is in range.  
[02:16] Okay.  
[02:17] Okay.  
[02:17] So essentially I'm wondering, can you take your AI skills that you have, take what I've  
[02:25] already used, vibe coded and fix that bug, maybe update it a little bit more, possibly  
[02:35] add like a layer system where I can then, okay, I have a layer of information that I  
[02:42] can just be like, well, this is the monster layer and I can see that.  
[02:45] and this is the light layer  
[02:48] where I can see all the players  
[02:50] lighting the positions  
[02:52] that players can see  
[02:53] and the position that monsters can see  
[02:56] but everything else is kind of  
[03:00] okay  
[03:01] I also need a secondary  
[03:04] thing  
[03:05] a session tracker  
[03:08] where  
[03:09] players will be given like a four digit  
[03:12] five digit I don't care what it is  
[03:14] a code to join a room yeah that is this it prompts them for their name yeah they don't need to do  
[03:21] anything else okay because i will track everything obviously the play the game state  
[03:25] this is the visual stuff that they'll have on their phone and they will then get placed by me  
[03:31] yeah and then it'll appear like this they'll then see this bottom right corner and they'll be like  
[03:38] okay we can begin the game right okay okay cool and i i also need to be able to have a quick way  
[03:44] to pick up them because it turns out this fucking thing it's got a pan feature and it's got a delete  
[03:51] feature but it's not got a select feature okay so uh that that would be another thing that i need to  
[03:58] figure out okay cool but everything else is what i'm everything else is how i'd like it you know  
[04:04] what I mean It uh it got a save feature for me to well okay That that doesn doesn seem to work but i can still export it the json and then import the json as well which is important for me to be able to get  
[04:20] back to the maps so it's been coded in html only because that's what claude decided but i need  
[04:27] something that's going to work across you know my app my app my devices yeah easily um yeah there's  
[04:34] quite a lot of questions actually so this is a multiplayer game is it the the players aren't  
[04:40] exactly doing anything other than viewing okay i'm gonna move them or they can move them but it  
[04:46] has to be their turn so the dm has to say it's their turn do you get what i'm saying yeah okay  
[04:52] yeah so the first thing i'm thinking of is like what kind of architectures is it like running on  
[04:57] like so i can see you've got html is like one piece of architecture that it runs on  
[05:03] I've sent the file to you already  
[05:06] so everything that exists is in that  
[05:09] one HTML file  
[05:10] from what I can see it doesn't say  
[05:12] it doesn't  
[05:15] it didn't give me anything else  
[05:17] if I pull a clog  
[05:18] so what I would start  
[05:21] with is  
[05:21] if you're serious about this I'd create a new repo  
[05:24] on GitHub and host all the code on there  
[05:26] and then you can  
[05:28] think about how the architecture  
[05:30] wants to be  
[05:31] like uh like what coding languages you want to use or what are the preferred ones uh where are  
[05:37] you going to host it if it's multiplayer or not and all these kind of things um so but from what  
[05:45] i can tell i don't have enough information to make good judgment on architecture straight away  
[05:50] um but i'll have to look into a bit more and see exactly what's going on exactly i host this on  
[05:55] like a vercell app or something like that yeah yeah you can host it on vercell you know what i  
[05:59] mean like yeah just host it on verse it's just going to be for our game yeah i mean this is not  
[06:03] this is not something that i want going out to production it is just an idea for me to make maps  
[06:09] and dungeons and cities a lot easier for you to then know where you're navigating yeah you know  
[06:16] what i mean like because me drawing and then use also because like it recommends the players  
[06:22] you should draw your own map as you go along yeah but that's don't need to leave ourselves for this  
[06:29] you can host it on github pages um so that just takes a bit of architecture away that you don't  
[06:34] really need um really any way that makes it as simple as possible that i can log into it  
[06:40] yeah access what i need to load up a new game and say hey it's new game that time and then  
[06:47] that game is going to have all the maps associated with that game yeah or i can export as i need  
[06:53] obviously okay and then allow me to just keep doing the because the token thing i think is the  
[06:58] best because i can just say oh well it's a fucking um that's an npc that's an ally that this is a  
[07:05] monster fucking demogorgons here you get what i'm saying it's not there's a lot of uh variation in  
[07:12] terms of imagination when it comes to how players are meant to be receiving it but  
[07:16] player view getting this working is what i really would hope for okay it being perfect okay you know  
[07:24] This is the key thing.  
[07:26] Great.  
[07:27] So what I'll do is I'll take all the points that you've mentioned  
[07:30] and I'll create a spec sheet out of it and I'll work off that.  
[07:33] And if there's anything you want to add to that spec sheet,  
[07:35] I'll share it with you and we can check it out  
[07:38] and see if it's a good spec sheet.  
[07:40] And then that will be kind of our roadmap, if you know what I mean.  
[07:44] Yeah, yeah, yeah.  
[07:45] Perfect.  
[07:46] I mean, to me, I'm already at prototype one.  
[07:48] I'm about two prototypes out before I'm happy.  
[07:51] Okay, cool.  
[07:52] You know what I mean?  
[07:52] With the base features.  
[07:54] you get what i'm saying 100 man uh the multiplayer aspect of like players joining  
[07:59] and being able to move their pawns when the dm deems it yeah not something that i think is high  
[08:07] up on the priority should be probably last yeah wait a second i've got a dog here hey charlie  
[08:12] but that it okay all right not not too complicated then uh but i are using just what are you using to build this Just Claude Chat or I just asked Claude Chat  
[08:26] Give me a second, this dog is.  
[08:28] Charlie, hey, get back, get out of there.  
[08:32] Get the fuck out of there from the desk.  
[08:33] Come on, there's loads of wires and shit.  
[08:37] Sorry.  
[08:38] All right, sounds good.  
[08:39] What I'll probably do is I will take the HTML  
[08:44] And then I will create a new directory and I'll create a repo and I'll put that HTML in there and then I'll host it on GitHub.  
[08:52] And then I'll start working from there.  
[08:55] So it's easy to track the changes that are made and the features that are updated.  
[08:59] And you can get a nice clear view of what's going on.  
[09:03] Perfect. Perfect.  
[09:05] Yeah, just any time now.  
[09:07] You know what I mean?  
[09:07] I'm not exactly in a rush.  
[09:09] I'm still waiting on getting like physical items from Amazon for our campaign or run yeah so like  
[09:17] this is purely for me to run like a lap my I could have my tablet you know behind the DM screen  
[09:24] and you could all have your phones beside your player character sheets and you can see the map  
[09:31] and what each person has unlocked so there needs to be some kind of sync between the players okay  
[09:37] about because if harry decides to fuck off to the north while you decide to fuck off to the west  
[09:44] they need to be able to know where each other is because i'm not going to put it the hardcore where  
[09:49] i'm like you can't tell where your friend is because you're not near them i'm not going to  
[09:53] do that that's that's a horrible maybe later on when i do a hardcore mode a feature set later but  
[10:00] thought now yeah but yeah that's the base sort of thing don't be afraid to put in more props  
[10:08] yeah as well okay uh more different tokens or different types of uh terrain you know what i  
[10:16] mean yeah like i don't mind that kind of thing just throw in shit that works yeah i'll show you  
[10:21] if i do i'll show you a sample uh and then you can make a judgment based on that but uh yeah  
[10:26] good thing is i'm i'm on a cloud max subscription so i've got a shit ton of tokens i can use and  
[10:31] i don't know what model you've been using for this uh but the new fable 5.1 is out so i can just  
[10:37] prompt sauna i've been using sauna oh yeah that's that's a good baseline it's all right like he's  
[10:43] it's been doing like it got me this far yeah but then it introduced a bug by itself um like i'm  
[10:50] like okay if i had the max subscription and i was able to just keep talking to it i'd probably have  
[10:55] this and you're the nearest person i know has that and this isn't this isn't like a massive  
[11:02] project per se i'm not pushing this out of production and if it ever does come an idea  
[11:06] where i'm like okay let's push it out angus i would be selling this for a one-time lifetime  
[11:12] fee because i hate people doing this subscription shit do you know every service that i've looked  
[11:17] that for this angus it either asks you to buy like individual things for the map design yeah  
[11:26] so it's micro transactions or it's a monthly transaction with access to their like library  
[11:32] yeah but their library doesn't get updated so you get all this like and they lock do you know  
[11:38] the lighting engine thing that i'm i was asked about this that's locked behind premium as well  
[11:43] no way what the heck so it's like why is this so why is this so locked down you know they're just  
[11:50] trying to make a shit ton of money i guess but they're not making a shit ton of money but yeah  
[11:56] i don't know how long this will take i'll have to come back and let you know but i don't think  
[12:03] it will be like super fast but who knows maybe with fable 5.1 i haven't tested fable 5.1 this  
[12:08] be a good test for it, you know?  
[12:10] Hey, if it can make a basic thing that we all can use on our devices at once and it's synced  
[12:17] and I can have a dungeon master view and I can peak the player view every now and then  
[12:22] to understand okay what can they see How can I describe this scene to them Yeah Hey you know it allows me to make real changes by the way at the same time you know obviously I be doing it in the fog of war as the game world calls it  
[12:37] yeah yeah  
[12:38] but yeah I think you have everything  
[12:42] any more questions just fire me a message  
[12:44] alright I think I know  
[12:46] what the architecture might be now to be honest  
[12:47] it sounds like a bit more simpler than I imagined  
[12:50] because I wasn't sure if it was like  
[12:51] so it's just between us  
[12:52] it is just going to be between us  
[12:55] It's going to have 8 players max  
[12:58] Minimum of 4  
[13:00] So it could just be run  
[13:02] On someone's computer  
[13:03] It could run on my tablet  
[13:06] And everyone joins it  
[13:08] You know what I mean  
[13:10] That's kind of the idea in my head  
[13:12] About it  
[13:13] Do you know the fucking games  
[13:16] That we were playing on Steam  
[13:17] Where someone would play  
[13:19] We're going to do a rap battle  
[13:20] Here's the code  
[13:22] It's the same premise  
[13:23] just not rap battle yeah what was that called jack in the box yes yeah okay cool uh yeah this is a  
[13:32] good uh i think i've got a lot to work off now i think uh yeah i'll throw a prompt into claude  
[13:39] like very soon and here is just some here's just some uh things to also assist like uh  
[13:46] uh roll 20. so that's a that's like a paid for service that has this thing another version of  
[13:57] it would be Dungeons Crawl right just for you know you want reference material about how other people  
[14:03] do it but they don't have that feature of roll 20 has the feature of players joining and they  
[14:09] make their moves i'm jeremy wade sorry okay dungeon scroll is just a dungeon builder okay  
[14:19] so that's more more uh what is it uh there's a word for uh when you're like wanting to get more  
[14:28] into the nitty-gritty yeah it'd be more dungeon scroll would be more nitty-gritty roll 20 is  
[14:35] I'm going to pick the World of Warcraft Dungeons and Dragons campaign  
[14:38] it's going to have all the assets on it  
[14:40] it's going to be in order  
[14:41] they know the module order  
[14:44] so it's chapter 1, chapter 2, chapter 3  
[14:46] and I'm just narrating while controlling how the players interact  
[14:50] okay cool  
[14:51] good things to work off  
[14:54] so these would be examples of what you want  
[14:55] you just want these kind of things copied over  
[14:57] in a sense  
[14:59] copied yeah but I don't want it one for one  
[15:01] because roll 20 is very heavy  
[15:04] in terms of an application but it's just very basic sort of i can give them like hey yous are  
[15:11] trapped in a prison right now and this is your exits and these are you can't see anything right  
[15:16] now you have to walk out the door and oh we've got an exit to the left we're next to the right  
[15:21] you're gonna exit in front of us you get what i'm saying yeah okay cool uh with lighting sources  
[15:28] being important as well yeah light source has been one of the key things you'd say yeah so  
[15:34] visibility and light sources uh is the one thing because these players we're doing a campaign  
[15:39] called out of the abyss and it's all based in the underdark and only one chapter occurs in  
[15:46] the overworld yeah we're like normal place and then you go back into the underdark  
[15:51] so we're all in cave systems lights very important okay cool interesting okay uh  
[15:58] Right, okay.  
[15:58] Yeah, let me throw something in the cloud,  
[16:00] see what it comes up with, and I'll share it with you.  
[16:03] But I have a fair idea of how I want to go about this, I think.  
[16:05] I think one thing I would like to see working first  
[16:08] is that light feature, that bug that you had.  
[16:11] It'd be nice to see that fixed first,  
[16:13] and then we can continue with it, you know?  
[16:17] Perfect.  
[16:18] Yeah, let me know what you find out.  
[16:22] Yeah, I mean, I can do it.  
[16:23] If you have any further questions, let me know.  
[16:24] well i've got a i gotta go pick up cat all right so okay but i will be back okay and i'll ask you  
[16:32] then if you get anything all right all right sounds good man sounds good talk to you a bit  
[16:37] thank you very much no worries no worries see you soon bye see ya  
