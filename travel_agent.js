import { Groq } from 'groq-sdk';
import readline from 'readline/promises';
import fetch from "node-fetch";

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';


const groq = new Groq({api_key: process.env.GROQ_API_KEY});

let db;

async function initializeDB(){
    db = await open({
        filename: './travel_agent.db',
        driver: sqlite3.Database
    });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        preferences TEXT,
        created_at DATETIME DEAFULT CURRENT_TIMESTAMP
    );
    
    
    CREATE TABLE IF NOT EXISTS intenaries(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        destination TEXT NOT NULL,
        start_date TEXT,
        end_date TEXT,
        activities TEXT,
        budget REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    );


    CREATE TABLE IF NOT EXISTS visited_places(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        place_name TEXT NOT NULL,
        country TEXT,
        visit_date TEXT,
        rating INTEGER,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    );

    
    CREATE TABLE IF NOT EXISTS saved_trips(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        destination TEXT,
        tip_category TEXT,
        tip_content TEXT,
        source TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    );



    CREATE TABLE IF NOT EXISTS safety_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            destination TEXT NOT NULL,
            alert_type TEXT,
            severity TEXT,
            description TEXT,
            valid_until TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    `)
    console.log("Database initialized successfully.");
}

const knowledgeBAse = {
    "safety-tips":{
        "general":[
            "Always keep copies of important documents",
            "Register with your embassy when traveling abroad",
            "Keep emergency contacts handy",
            "Research local emergency numbers"
        ],
        "solo_travelers":[
            "Share your itinerary with trusted contacts",
            "Stay in well-reviewed accommodations",
            "Trust your instincts about people and situations"
        ],
        
    },
    "local_costume":{
        "asia":[
            "Remove shoes when entering homes and temples",
            "Bow as a greeting in Japan and Korea",
            "Dress modestly when visiting religious sites"
        ],
        "europe":[
            "Tipping is generally 10-15% in restaurants",
            "Many shops close on Sundays",
            "Public transportation is usually very reliable"
        ]
    },
    "budget_tips":[
        "Book flights on Tuesday or Wednesday for better deals",
        "Use public transportation instead of taxis",
        "Eat at local markets and street food stalls",
        "Stay in hostels or use home-sharing platforms"
    ]
};

async function CallTravelAgent(){
    await initializeDB();

    const rl = readline.createInterface({
        input:process.stdin,
        output: process.stdout
    });

    const userName = await rl.question("What is your name? ");
    const userEmail = await rl.question("What is your email? ");
    let user = await db.get("SELECT * FROM users WHERE email = ?", [userEmail]);


    if(!user){
        const result = await db.run('INSERT INTO users (name, email) VALUES(?,?)', [userName, userEmail]);
        user = {
            id:result.lastID,
            name:userName,
            email:userEmail
        };
        console.log(`Welcome ${userName}! Your profile has been created.`);
    }else{
        console.log(`Welcome back ${user.name}!`);
    }

    const messages = [
        {
            role:'system',
            content:`You are a travel agent with access to a database of users, itineraries, visited places, saved trips, and safety alerts. You can provide personalized travel advice, create itineraries, and offer safety tips based on user preferences and past travel history. Use the knowledge base for general travel tips and local customs.
            
            Your capabilities include:
            1. createItinerary: Create a personalized travel itinerary and save it to database
            2. getLocalTips: Get local tips and recommendations for a destination
            3. getSafetyInfo: Get safety information and alerts for a destination
            4. translateText: Translate text to help with communication
            5. addVisitedPlace: Record a place the user has visited
            6. getUserHistory: Get user's travel history and preferences
            7. saveTip: Save a useful travel tip for future reference
            8. getNearbyPlaces: Get nearby attractions using location data`
        }
    ];

    while(true){
        const question = await rl.question("User:");
        if(question === "bye" || question === "good bye" ||question === "exit"){
            break;
        }
        messages.push({
            role:'user',
            content: question
        })
        while(true){
            const completion = await groq.chat.completions.create({
                messages:messages,
                model:'meta-llama/llama-4-scout-17b-16e-instruct',
                tools:[
                    {
                        type:'function',
                        function:{
                            name:'createItenary',
                            description:'Create a personalized travel itinerary and save it to the database',
                            parameters:{
                                type:'object',
                                properties:{
                                    destination:{
                                        type:'string',
                                        description:'The destination for the itinerary'
                                    },
                                    days:{
                                        type:'integer',
                                        description:'number of days for the trip',
                                    },
                                    start_date:{
                                        type:'string',
                                        description:'The start date of the trip in YYYY-MM-DD format'
                                    },
                                    end_date:{
                                        type:'string',
                                        description:'The end date of the trip in YYYY-MM-DD format'
                                    },
                                    activities:{
                                        type:'string',
                                        descrption:'A list of activities planned for the trip, separated by commas'
                                    },
                                    budget:{
                                        type:'number',
                                        description:'The budget for the trip in INR'
                                    }
                                },
                                required:['destination', 'start_date', 'end_date']
                            }
                        }
                    },
                    {
                        type:'function',
                        function:{
                            name:'getLocalTips',
                            description:'Get local tips and recommendations for a destination',
                            parameters:{
                                type:'object',
                                properties:{
                                    description:{
                                        type:'string',
                                        description:'destination to get tips for'
                                    },
                                    category:{
                                        type:'string',
                                        description:'Category of tips to retrieve (e.g., local customs, budget tips, safety tips)',
                                    }
                                },
                                required:['description']
                            }
                        }
                    },
                    {
                        type:'function',
                        function:{
                            name:'getSafetyInfo',
                            description:'Get safety information and alerts for a destination',
                            parameters:{
                                type:'object',
                                properties:{
                                    text:{
                                        type:'string',
                                        description:'text to translate',
                                    },
                                    targetLanguage:{
                                        type:'string',
                                        description:'target language  code (e.g., es, fr, de)',
                                    }
                                },
                                required:['text', 'targetLanguage']

                            }
                        }
                    },
                    {
                        type:'function',
                        function:{
                            name:'addVisitedPlace',
                            description:'Record a place the user has visited',
                            parameters:{
                                placeName:{
                                    type:'string',
                                    description:'Name of the place visited'

                                },
                                country:{
                                    type:'string',
                                    desciption:'Country where the place is located'
                                },
                                visitDate:{
                                    type:'string',
                                    description:'Date of visit in YYYY-MM-DD format'
                                },
                                rating:{
                                    type:'integer',
                                    description:'Rating given to the place (1-5)'
                                },
                                notes:{
                                    type:'string',
                                    description:'Any additional notes about the visit'
                                }
                            },
                            required:['placeName', 'country']
                        }
                    },
                    {
                        type:'function',
                        function:{
                            name:'getUserHistory',
                            description:'Get user\'s travel history and preferences',
                            parameters:{
                                type:'object',
                                properties:{}
                            }
                        }
                    }
                ]
            });
            messages.push(completion.choices[0].message);
            const toolCalls = completion.choices[0].message.tool_calls;
            if(!toolCalls){
                console.log("Travel Agent:", completion.choices[0].message.content);
                break;
            }
            for(const toolCall of toolCalls){
                const functionName = toolCall.function.name;
                const functionArgs = JSON.parse(toolCall.function.arguments);
                let result = "";

                try{
                    switch(functionName){
                        case 'createItenary':
                            result = await createItinerary(user.id, functionArgs);
                            break;
                        case 'getLocalTips':
                            result = await getLocalTips(functionArgs
                                
                            );
                            break;
                        case 'getSafetyInfo':
                            result = await getSafetyInfo(functionArgs);
                            break;
                        case 'addVisitedPlace':
                            result = await addVisitedPlace(user.id, functionArgs);
                            break;
                        case 'getUserHistory':
                            result = await getUserHistory(user.id);
                            break;
                        default:
                            result = "function not implemented yet."
                    }
                }catch(error){
                    result = `Error: ${error.message}`;
                }
                messages.push({
                    role:'tool',
                    content:result,
                    tool_call_id:toolCall.id

                });
            }
        }
    }
    rl.close();
    await db.close();
    console.log('\n👋 Thanks for using TravelBot! Safe travels!');

}






CallTravelAgent()   

















