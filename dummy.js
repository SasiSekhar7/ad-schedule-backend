// const generateAdSchedule =(durationMinutes = 960) =>{
//     const ads = [
//         { name: "Ad1", duration: 30, totalPlaytime: 360 },
//         { name: "Ad2", duration: 30, totalPlaytime: 360 },
//         { name: "Ad3", duration: 60, totalPlaytime: 100 },
//         { name: "Ad4", duration: 20, totalPlaytime: 140 },
//     ];

const { getCustomUTCDateTime } = require("./helpers");

    
//     ads.forEach(ad => {
//         ad.playsNeeded = Math.floor((ad.totalPlaytime * 60) / ad.duration);
//         ad.frequency = ad.playsNeeded / durationMinutes;
//     });
    
//     ads.sort((a, b) => b.frequency - a.frequency);
    
//     let schedule = [];
//     let adQueues = {};
    
//     ads.forEach(ad => {
//         adQueues[ad.name] = Array(Math.round(ad.frequency * 10)).fill(ad.name);
//     });
    
//     for (let minute = 0; minute < durationMinutes * 60; minute++) {
//         if (minute % 60 === 0) {
//             schedule.push(`--- Minute ${Math.floor(minute / 60)} ---`);
//         }
        
//         ads.forEach(ad => {
//             if (minute % Math.round(1 / ad.frequency) === 0 && ad.playsNeeded > 0) {
//                 schedule.push(adQueues[ad.name].shift() || ad.name);
//                 ad.playsNeeded--;
//             }
//         });
//     }
    
//     return schedule;
// }

// const schedule = generateAdSchedule();
// console.log(schedule.slice(0, 200).join('\n'));

// function generateAdSchedule(durationMinutes = 960) {
//     const ads = [
//         { name: "Ad1", duration: 30, totalPlaytime: 360 },
//         { name: "Ad2", duration: 30, totalPlaytime: 360 },
//         { name: "Ad3", duration: 60, totalPlaytime: 100 },
//         { name: "Ad4", duration: 20, totalPlaytime: 140 },
//     ];

//     // Calculate plays needed and frequency
//     ads.forEach(ad => {
//         ad.playsNeeded = Math.floor((ad.totalPlaytime * 60) / ad.duration);
//         ad.frequency = ad.playsNeeded / durationMinutes;
//     });

//     ads.sort((a, b) => b.frequency - a.frequency);

//     let schedule = {};
    
//     for (let minute = 0; minute < durationMinutes; minute++) {
//         schedule[minute] = [];
//     }

//     // Distribute ads while ensuring they fit within a minute
//     ads.forEach(ad => {
//         let playsRemaining = ad.playsNeeded;
//         let minute = 0;
        
//         while (playsRemaining > 0) {
//             let totalTimeUsed = schedule[minute].reduce((sum, ad) => sum + ad.duration, 0);
            
//             if (totalTimeUsed + ad.duration <= 60) {
//                 schedule[minute].push(ad);
//                 playsRemaining--;
//             }
            
//             minute = (minute + 1) % durationMinutes;  // Rotate through available minutes
//         }
//     });

//     // Print schedule
//     for (let minute = 0; minute < 200; minute++) {  // Print first 200 minutes
//         console.log(`Minute ${minute}:`, schedule[minute].map(ad => ad.name).join(", "));
//     }
// }

// // Run the schedule
// generateAdSchedule();


console.log(getCustomUTCDateTime())