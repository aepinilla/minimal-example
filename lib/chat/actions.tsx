import 'server-only'

import {
  createAI,
  createStreamableUI,
  getMutableAIState,
  getAIState,
  streamUI,
  createStreamableValue
} from 'ai/rsc'
import { openai } from '@ai-sdk/openai'

import {
  spinner,
  BotCard,
  BotMessage,
  SystemMessage,
  Stock,
  Purchase
} from '@/components/stocks'

import { z } from 'zod'
import { EventsSkeleton } from '@/components/stocks/events-skeleton'
import { Events } from '@/components/stocks/events'
import { StocksSkeleton } from '@/components/stocks/stocks-skeleton'
import { Stocks } from '@/components/stocks/stocks'
import { StockSkeleton } from '@/components/stocks/stock-skeleton'
import {
  formatNumber,
  runAsyncFnWithoutBlocking,
  sleep,
  nanoid
} from '@/lib/utils'
import { saveChat } from '@/app/actions'
import { SpinnerMessage, UserMessage } from '@/components/stocks/message'
import { Chat, Message } from '@/lib/types'
import { auth } from '@/auth'


//async function confirmPurchase(symbol: string, price: number, amount: number) {
async function confirmDownload(name: string, url: string) {

    'use server'

  const aiState = getMutableAIState<typeof AI>()

//   const purchasing = createStreamableUI(
//     <div className="inline-flex items-start gap-1 md:items-center">
//       {spinner}
//       <p className="mb-2">
//         Purchasing {amount} ${symbol}...
//       </p>
//     </div>
//   )
const purchasing = createStreamableUI(
    <div className="inline-flex items-start gap-1 md:items-center">
      {spinner}
      <p className="mb-2">
        Downloading {name} ${url}...
      </p>
    </div>
  )

  const systemMessage = createStreamableUI(null)

  runAsyncFnWithoutBlocking(async () => {
    await sleep(1000)

    // purchasing.update(
    //   <div className="inline-flex items-start gap-1 md:items-center">
    //     {spinner}
    //     <p className="mb-2">
    //       Purchasing {amount} ${symbol}... working on it...
    //     </p>
    //   </div>
    // )

    purchasing.update(
        <div className="inline-flex items-start gap-1 md:items-center">
          {spinner}
          <p className="mb-2">
            Downloading {name} ${url}... working on it...
          </p>
        </div>
      )

    await sleep(1000)

    // purchasing.done(
    //   <div>
    //     <p className="mb-2">
    //       You have successfully purchased {amount} ${symbol}. Total cost:{' '}
    //       {formatNumber(amount * price)}
    //     </p>
    //   </div>
    // )

    purchasing.done(
        <div>
          <p className="mb-2">
            You have successfully downloaded {name} ${url}.
          </p>
        </div>
      )

    // systemMessage.done(
    //   <SystemMessage>
    //     You have purchased {amount} shares of {symbol} at ${price}. Total cost ={' '}
    //     {formatNumber(amount * price)}.
    //   </SystemMessage>
    // )

    systemMessage.done(
        <SystemMessage>
          You have downloaded {name} from {url}.
        </SystemMessage>
      )
      
      aiState.done({
        ...aiState.get(),
        messages: [
            ...aiState.get().messages,
            {
                id: nanoid(),
                role: 'system',
                content: `[User has downladed ${name} from ${url}.]`
            }
        ]
    })
})

//     aiState.done({
//       ...aiState.get(),
//       messages: [
//         ...aiState.get().messages,
//         {
//           id: nanoid(),
//           role: 'system',
//           content: `[User has purchased ${amount} shares of ${symbol} at ${price}. Total cost = ${
//             amount * price
//           }]`
//         }
//       ]
//     })
//   })

  return {
    purchasingUI: purchasing.value,
    newMessage: {
      id: nanoid(),
      display: systemMessage.value
    }
  }
}

async function submitUserMessage(content: string) {
  'use server'
  
  const aiState = getMutableAIState<typeof AI>()

  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: 'user',
        content
      }
    ]
  })

  let textStream: undefined | ReturnType<typeof createStreamableValue<string>>
  let textNode: undefined | React.ReactNode

  const result = await streamUI({
    model: openai('gpt-3.5-turbo'),
    initial: <SpinnerMessage />,
    system: `\
    You are a DJ Assistant and you can help users with 
    downloading the audio from YouTube videos, and splitting 
    the audio into different stems. For example, into vocals 
    and instruments. Display at least 10 songs, or more if the user asks for more.`,
    // system: `\
    // You are a stock trading conversation bot and you can help users buy stocks, step by step.
    // You and the user can discuss stock prices and the user can adjust the amount of stocks they want to buy, or place an order, in the UI.
    
    // Messages inside [] means that it's a UI element or a user event. For example:
    // - "[Price of AAPL = 100]" means that an interface of the stock price of AAPL is shown to the user.
    // - "[User has changed the amount of AAPL to 10]" means that the user has changed the amount of AAPL to 10 in the UI.
    
    // If the user requests purchasing a stock, call \`show_stock_purchase_ui\` to show the purchase UI.
    // If the user just wants the price, call \`show_stock_price\` to show the price.
    // If you want to show trending stocks, call \`list_stocks\`.
    // If you want to show events, call \`get_events\`.
    // If the user wants to sell stock, or complete another impossible task, respond that you are a demo and cannot do that.
    
    // Besides that, you can also chat with users and do some calculations if needed.`,
    messages: [
      ...aiState.get().messages.map((message: any) => ({
        role: message.role,
        content: message.content,
        name: message.name
      }))
    ],
    text: ({ content, done, delta }) => {
      if (!textStream) {
        textStream = createStreamableValue('')
        textNode = <BotMessage content={textStream.value} />
      }

      if (done) {
        textStream.done()
        aiState.done({
          ...aiState.get(),
          messages: [
            ...aiState.get().messages,
            {
              id: nanoid(),
              role: 'assistant',
              content
            }
          ]
        })
      } else {
        textStream.update(delta)
      }

      return textNode
    },
    tools: {
        listSongs: {
          description: 'List songs related to the topic mentioned by the user.',
          parameters: z.object({
            songs: z.array(
              z.object({
                name: z.string().describe('The name of the song'),
                url: z.string().describe('The URL of the YouTube video'),
  
              })
            )
          }),
          generate: async function* ({ songs }) {
            yield (
              <ol>
                {songs.map((song, index) => (
                  <li key={index}>
                    <a href={song.url}><u>{song.name}</u></a>
                  </li>
                ))}
              </ol>
            )
  
            await sleep(1000)
  
            const toolCallId = nanoid()
  
            aiState.done({
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'listSongs',
                      toolCallId,
                      args: { songs }
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'listSongs',
                      toolCallId,
                      result: songs
                    }
                  ]
                }
              ]
            })
  
            return (
              <div className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0">
              <ol>
                {songs.map((song, index) => (
                  <li key={index}>
                    <a href={song.url} target='blank'><u>{song.name}</u></a>
                  </li>
                ))}
              </ol>
            </div>
            )
          }
        },
        downloadAudio: {
          description: 'Download the audio from the YouTube song.',
          parameters: z.object({
            songs: z.array(
              z.object({
                name: z.string().describe('The name of the song'),
                url: z.string().describe('The URL of the YouTube video'),
                type: z.enum(['original', 'karaoke']).describe('The type of the audio')
              })
            )
          }),
          generate: async function* ({ songs }) {
            yield (
              <div>Downloading...</div>
            )
            
            const toolCallId = nanoid()
        
            
            //const response_scrapper = await fetch('http://0.0.0.0:8000/api/scraper', {
            const response_scrapper = await fetch('https://scraper-7o93.onrender.com/api/scraper', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ songs: songs.map(song => ({ ...song})) })
            })
            const responseJson = await response_scrapper.json();
            console.log(responseJson);
  
  
            aiState.done({
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'downloadAudio',
                      toolCallId,
                      args: { songs }
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'downloadAudio',
                      toolCallId,
                      result: songs
                    }
                  ]
                }
              ]
            })
  
            return (
              <div>Download completed. Please check your S3 bucket.</div>
              // <BotCard>
              //   <Stock props={{ symbol, price, delta }} />
              // </BotCard>
            )
          }
        },
      }
    // tools: {
    //   listStocks: {
    //     description: 'List three imaginary stocks that are trending.',
    //     parameters: z.object({
    //       stocks: z.array(
    //         z.object({
    //           symbol: z.string().describe('The symbol of the stock'),
    //           price: z.number().describe('The price of the stock'),
    //           delta: z.number().describe('The change in price of the stock')
    //         })
    //       )
    //     }),
    //     generate: async function* ({ stocks }) {
    //       yield (
    //         <BotCard>
    //           <StocksSkeleton />
    //         </BotCard>
    //       )

    //       await sleep(1000)

    //       const toolCallId = nanoid()

    //       aiState.done({
    //         ...aiState.get(),
    //         messages: [
    //           ...aiState.get().messages,
    //           {
    //             id: nanoid(),
    //             role: 'assistant',
    //             content: [
    //               {
    //                 type: 'tool-call',
    //                 toolName: 'listStocks',
    //                 toolCallId,
    //                 args: { stocks }
    //               }
    //             ]
    //           },
    //           {
    //             id: nanoid(),
    //             role: 'tool',
    //             content: [
    //               {
    //                 type: 'tool-result',
    //                 toolName: 'listStocks',
    //                 toolCallId,
    //                 result: stocks
    //               }
    //             ]
    //           }
    //         ]
    //       })

    //       return (
    //         <BotCard>
    //           <Stocks props={stocks} />
    //         </BotCard>
    //       )
    //     }
    //   },
    //   showStockPrice: {
    //     description:
    //       'Get the current stock price of a given stock or currency. Use this to show the price to the user.',
    //     parameters: z.object({
    //       symbol: z
    //         .string()
    //         .describe(
    //           'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.'
    //         ),
    //       price: z.number().describe('The price of the stock.'),
    //       delta: z.number().describe('The change in price of the stock')
    //     }),
    //     generate: async function* ({ symbol, price, delta }) {
    //       yield (
    //         <BotCard>
    //           <StockSkeleton />
    //         </BotCard>
    //       )

    //       await sleep(1000)

    //       const toolCallId = nanoid()

    //       aiState.done({
    //         ...aiState.get(),
    //         messages: [
    //           ...aiState.get().messages,
    //           {
    //             id: nanoid(),
    //             role: 'assistant',
    //             content: [
    //               {
    //                 type: 'tool-call',
    //                 toolName: 'showStockPrice',
    //                 toolCallId,
    //                 args: { symbol, price, delta }
    //               }
    //             ]
    //           },
    //           {
    //             id: nanoid(),
    //             role: 'tool',
    //             content: [
    //               {
    //                 type: 'tool-result',
    //                 toolName: 'showStockPrice',
    //                 toolCallId,
    //                 result: { symbol, price, delta }
    //               }
    //             ]
    //           }
    //         ]
    //       })

    //       return (
    //         <BotCard>
    //           <Stock props={{ symbol, price, delta }} />
    //         </BotCard>
    //       )
    //     }
    //   },
    //   showStockPurchase: {
    //     description:
    //       'Show price and the UI to purchase a stock or currency. Use this if the user wants to purchase a stock or currency.',
    //     parameters: z.object({
    //       symbol: z
    //         .string()
    //         .describe(
    //           'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.'
    //         ),
    //       price: z.number().describe('The price of the stock.'),
    //       numberOfShares: z
    //         .number()
    //         .optional()
    //         .describe(
    //           'The **number of shares** for a stock or currency to purchase. Can be optional if the user did not specify it.'
    //         )
    //     }),
        
    //     generate: async function* ({ symbol, price, numberOfShares = 100 }) {
    //       // Adding delay to simulate a real-world scenario
    //       await sleep(16000)

    //       const toolCallId = nanoid()

    //       if (numberOfShares <= 0 || numberOfShares > 1000) {
    //         aiState.done({
    //           ...aiState.get(),
    //           messages: [
    //             ...aiState.get().messages,
    //             {
    //               id: nanoid(),
    //               role: 'assistant',
    //               content: [
    //                 {
    //                   type: 'tool-call',
    //                   toolName: 'showStockPurchase',
    //                   toolCallId,
    //                   args: { symbol, price, numberOfShares }
    //                 }
    //               ]
    //             },
    //             {
    //               id: nanoid(),
    //               role: 'tool',
    //               content: [
    //                 {
    //                   type: 'tool-result',
    //                   toolName: 'showStockPurchase',
    //                   toolCallId,
    //                   result: {
    //                     symbol,
    //                     price,
    //                     numberOfShares,
    //                     status: 'expired'
    //                   }
    //                 }
    //               ]
    //             },
    //             {
    //               id: nanoid(),
    //               role: 'system',
    //               content: `[User has selected an invalid amount]`
    //             }
    //           ]
    //         })

    //         return <BotMessage content={'Invalid amount'} />
    //       } else {
    //         aiState.done({
    //           ...aiState.get(),
    //           messages: [
    //             ...aiState.get().messages,
    //             {
    //               id: nanoid(),
    //               role: 'assistant',
    //               content: [
    //                 {
    //                   type: 'tool-call',
    //                   toolName: 'showStockPurchase',
    //                   toolCallId,
    //                   args: { symbol, price, numberOfShares }
    //                 }
    //               ]
    //             },
    //             {
    //               id: nanoid(),
    //               role: 'tool',
    //               content: [
    //                 {
    //                   type: 'tool-result',
    //                   toolName: 'showStockPurchase',
    //                   toolCallId,
    //                   result: {
    //                     symbol,
    //                     price,
    //                     numberOfShares
    //                   }
    //                 }
    //               ]
    //             }
    //           ]
    //         })

    //         return (
    //           <BotCard>
    //             <Purchase
    //               props={{
    //                 numberOfShares,
    //                 symbol,
    //                 price: +price,
    //                 status: 'requires_action'
    //               }}
    //             />
    //           </BotCard>
    //         )
    //       }
    //     }
    //   },
    //   getEvents: {
    //     description:
    //       'List funny imaginary events between user highlighted dates that describe stock activity.',
    //     parameters: z.object({
    //       events: z.array(
    //         z.object({
    //           date: z
    //             .string()
    //             .describe('The date of the event, in ISO-8601 format'),
    //           headline: z.string().describe('The headline of the event'),
    //           description: z.string().describe('The description of the event')
    //         })
    //       )
    //     }),
    //     generate: async function* ({ events }) {
    //       yield (
    //         <BotCard>
    //           <EventsSkeleton />
    //         </BotCard>
    //       )

    //       await sleep(1000)

    //       const toolCallId = nanoid()

    //       aiState.done({
    //         ...aiState.get(),
    //         messages: [
    //           ...aiState.get().messages,
    //           {
    //             id: nanoid(),
    //             role: 'assistant',
    //             content: [
    //               {
    //                 type: 'tool-call',
    //                 toolName: 'getEvents',
    //                 toolCallId,
    //                 args: { events }
    //               }
    //             ]
    //           },
    //           {
    //             id: nanoid(),
    //             role: 'tool',
    //             content: [
    //               {
    //                 type: 'tool-result',
    //                 toolName: 'getEvents',
    //                 toolCallId,
    //                 result: events
    //               }
    //             ]
    //           }
    //         ]
    //       })

    //       return (
    //         <BotCard>
    //           <Events props={events} />
    //         </BotCard>
    //       )
    //     }
    //   }
    // }
  })

  return {
    id: nanoid(),
    display: result.value
  }
}

export type AIState = {
  chatId: string
  messages: Message[]
}

export type UIState = {
  id: string
  display: React.ReactNode
}[]

export const AI = createAI<AIState, UIState>({
  actions: {
    submitUserMessage,
    confirmDownload
    // confirmPurchase
  },
  initialUIState: [],
  initialAIState: { chatId: nanoid(), messages: [] },
  onGetUIState: async () => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const aiState = getAIState() as Chat

      if (aiState) {
        const uiState = getUIStateFromAIState(aiState)
        return uiState
      }
    } else {
      return
    }
  },
  onSetAIState: async ({ state }) => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const { chatId, messages } = state

      const createdAt = new Date()
      const userId = session.user.id as string
      const path = `/chat/${chatId}`

      const firstMessageContent = messages[0].content as string
      const title = firstMessageContent.substring(0, 100)

      const chat: Chat = {
        id: chatId,
        title,
        userId,
        createdAt,
        messages,
        path
      }

      await saveChat(chat)
    } else {
      return
    }
  }
})

export const getUIStateFromAIState = (aiState: Chat) => {
  return aiState.messages
    .filter(message => message.role !== 'system')
    .map((message, index) => ({
      id: `${aiState.chatId}-${index}`,
      display:
        message.role === 'tool' ? (
            message.content.map(tool => {
                return tool.toolName === 'listSongs' ? (
                  "List of songs"
                //   <BotCard>
                //     {/* TODO: Infer types based on the tool result*/}
                //     {/* @ts-expect-error */}
                //     <Stocks props={tool.result} />
                //   </BotCard>
                // ) : tool.toolName === 'showStockPrice' ? (
                //   <BotCard>
                //     {/* @ts-expect-error */}
                //     <Stock props={tool.result} />
                //   </BotCard>
                // ) : tool.toolName === 'showStockPurchase' ? (
                //   <BotCard>
                //     {/* @ts-expect-error */}
                //     <Purchase props={tool.result} />
                //   </BotCard>
                // ) : tool.toolName === 'getEvents' ? (
                //   <BotCard>
                //     {/* @ts-expect-error */}
                //     <Events props={tool.result} />
                //   </BotCard>
                ) : null
              })
        //   message.content.map(tool => {
        //     return tool.toolName === 'listStocks' ? (
        //       <BotCard>
        //         {/* TODO: Infer types based on the tool result*/}
        //         {/* @ts-expect-error */}
        //         <Stocks props={tool.result} />
        //       </BotCard>
        //     ) : tool.toolName === 'showStockPrice' ? (
        //       <BotCard>
        //         {/* @ts-expect-error */}
        //         <Stock props={tool.result} />
        //       </BotCard>
        //     ) : tool.toolName === 'showStockPurchase' ? (
        //       <BotCard>
        //         {/* @ts-expect-error */}
        //         <Purchase props={tool.result} />
        //       </BotCard>
        //     ) : tool.toolName === 'getEvents' ? (
        //       <BotCard>
        //         {/* @ts-expect-error */}
        //         <Events props={tool.result} />
        //       </BotCard>
        //     ) : null
        //   })
        ) : message.role === 'user' ? (
          <UserMessage>{message.content as string}</UserMessage>
        ) : message.role === 'assistant' &&
          typeof message.content === 'string' ? (
          <BotMessage content={message.content} />
        ) : null
    }))
}
