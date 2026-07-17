package app.zkpassport.zkpassport

import java.math.BigInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object Poseidon2 {
    // BN254 field prime
    private val PRIME = BigInteger("21888242871839275222246405745257275088548364400416034343698204186575808495617")
    private val ZERO = BigInteger.ZERO
    private val ONE = BigInteger.ONE

    // Parameters for BN254 field with t=4
    private const val T = 4
    private const val D = 5
    private const val roundsF = 8
    private const val roundsP = 56
    private const val rounds = roundsF + roundsP
    private const val roundsFBeginning = roundsF / 2
    private const val roundsFEnd = roundsF / 2

    private val MAT_INTERNAL_DIAG_M_1 = listOf(
        BigInteger("10dc6e9c006ea38b04b1e03b4bd9490c0d03f98929ca1d7fb56821fd19d3b6e7", 16),
        BigInteger("0c28145b6a44df3e0149b3d0a30b3bb599df9756d4dd9b84a86b38cfb45a740b", 16),
        BigInteger("00544b8338791518b2c7645a50392798b21f75bb60e3596170067d00141cac15", 16),
        BigInteger("222c01175718386f2e2e82eb122789e352e105a3b8fa852613bc534433ee428b", 16)
    )

    private val MAT_INTERNAL = listOf(
        listOf(
            BigInteger("10dc6e9c006ea38b04b1e03b4bd9490c0d03f98929ca1d7fb56821fd19d3b6e8", 16),
            BigInteger("1"),
            BigInteger("1"),
            BigInteger("1")
        ),
        listOf(
            BigInteger("1"),
            BigInteger("0c28145b6a44df3e0149b3d0a30b3bb599df9756d4dd9b84a86b38cfb45a740c", 16),
            BigInteger("1"),
            BigInteger("1")
        ),
        listOf(
            BigInteger("1"),
            BigInteger("1"),
            BigInteger("00544b8338791518b2c7645a50392798b21f75bb60e3596170067d00141cac16", 16),
            BigInteger("1")
        ),
        listOf(
            BigInteger("1"),
            BigInteger("1"),
            BigInteger("1"),
            BigInteger("222c01175718386f2e2e82eb122789e352e105a3b8fa852613bc534433ee428c", 16)
        )
    )

    private val roundConstants = buildList {
        // First 4 full rounds
        add(listOf(
            BigInteger("19b849f69450b06848da1d39bd5e4a4302bb86744edc26238b0878e269ed23e5", 16),
            BigInteger("265ddfe127dd51bd7239347b758f0a1320eb2cc7450acc1dad47f80c8dcf34d6", 16),
            BigInteger("199750ec472f1809e0f66a545e1e51624108ac845015c2aa3dfc36bab497d8aa", 16),
            BigInteger("157ff3fe65ac7208110f06a5f74302b14d743ea25067f0ffd032f787c7f1cdf8", 16)
        ))
        add(listOf(
            BigInteger("2e49c43c4569dd9c5fd35ac45fca33f10b15c590692f8beefe18f4896ac94902", 16),
            BigInteger("0e35fb89981890520d4aef2b6d6506c3cb2f0b6973c24fa82731345ffa2d1f1e", 16),
            BigInteger("251ad47cb15c4f1105f109ae5e944f1ba9d9e7806d667ffec6fe723002e0b996", 16),
            BigInteger("13da07dc64d428369873e97160234641f8beb56fdd05e5f3563fa39d9c22df4e", 16)
        ))
        add(listOf(
            BigInteger("0c009b84e650e6d23dc00c7dccef7483a553939689d350cd46e7b89055fd4738", 16),
            BigInteger("011f16b1c63a854f01992e3956f42d8b04eb650c6d535eb0203dec74befdca06", 16),
            BigInteger("0ed69e5e383a688f209d9a561daa79612f3f78d0467ad45485df07093f367549", 16),
            BigInteger("04dba94a7b0ce9e221acad41472b6bbe3aec507f5eb3d33f463672264c9f789b", 16)
        ))
        add(listOf(
            BigInteger("0a3f2637d840f3a16eb094271c9d237b6036757d4bb50bf7ce732ff1d4fa28e8", 16),
            BigInteger("259a666f129eea198f8a1c502fdb38fa39b1f075569564b6e54a485d1182323f", 16),
            BigInteger("28bf7459c9b2f4c6d8e7d06a4ee3a47f7745d4271038e5157a32fdf7ede0d6a1", 16),
            BigInteger("0a1ca941f057037526ea200f489be8d4c37c85bbcce6a2aeec91bd6941432447", 16)
        ))

        // Partial rounds (56 rounds, only first element used)
        add(listOf(
            BigInteger("0c6f8f958be0e93053d7fd4fc54512855535ed1539f051dcb43a26fd926361cf", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("123106a93cd17578d426e8128ac9d90aa9e8a00708e296e084dd57e69caaf811", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("26e1ba52ad9285d97dd3ab52f8e840085e8fa83ff1e8f1877b074867cd2dee75", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("1cb55cad7bd133de18a64c5c47b9c97cbe4d8b7bf9e095864471537e6a4ae2c5", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("1dcd73e46acd8f8e0e2c7ce04bde7f6d2a53043d5060a41c7143f08e6e9055d0", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("011003e32f6d9c66f5852f05474a4def0cda294a0eb4e9b9b12b9bb4512e5574", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("2b1e809ac1d10ab29ad5f20d03a57dfebadfe5903f58bafed7c508dd2287ae8c", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("2539de1785b735999fb4dac35ee17ed0ef995d05ab2fc5faeaa69ae87bcec0a5", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("0c246c5a2ef8ee0126497f222b3e0a0ef4e1c3d41c86d46e43982cb11d77951d", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("192089c4974f68e95408148f7c0632edbb09e6a6ad1a1c2f3f0305f5d03b527b", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("1eae0ad8ab68b2f06a0ee36eeb0d0c058529097d91096b756d8fdc2fb5a60d85", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("179190e5d0e22179e46f8282872abc88db6e2fdc0dee99e69768bd98c5d06bfb", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("29bb9e2c9076732576e9a81c7ac4b83214528f7db00f31bf6cafe794a9b3cd1c", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("225d394e42207599403efd0c2464a90d52652645882aac35b10e590e6e691e08", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("064760623c25c8cf753d238055b444532be13557451c087de09efd454b23fd59", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("10ba3a0e01df92e87f301c4b716d8a394d67f4bf42a75c10922910a78f6b5b87", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("0e070bf53f8451b24f9c6e96b0c2a801cb511bc0c242eb9d361b77693f21471c", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("1b94cd61b051b04dd39755ff93821a73ccd6cb11d2491d8aa7f921014de252fb", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("1d7cb39bafb8c744e148787a2e70230f9d4e917d5713bb050487b5aa7d74070b", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("2ec93189bd1ab4f69117d0fe980c80ff8785c2961829f701bb74ac1f303b17db", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("2db366bfdd36d277a692bb825b86275beac404a19ae07a9082ea46bd83517926", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("062100eb485db06269655cf186a68532985275428450359adc99cec6960711b8", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("0761d33c66614aaa570e7f1e8244ca1120243f92fa59e4f900c567bf41f5a59b", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("20fc411a114d13992c2705aa034e3f315d78608a0f7de4ccf7a72e494855ad0d", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("25b5c004a4bdfcb5add9ec4e9ab219ba102c67e8b3effb5fc3a30f317250bc5a", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("23b1822d278ed632a494e58f6df6f5ed038b186d8474155ad87e7dff62b37f4b", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("22734b4c5c3f9493606c4ba9012499bf0f14d13bfcfcccaa16102a29cc2f69e0", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("26c0c8fe09eb30b7e27a74dc33492347e5bdff409aa3610254413d3fad795ce5", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("070dd0ccb6bd7bbae88eac03fa1fbb26196be3083a809829bbd626df348ccad9", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("12b6595bdb329b6fb043ba78bb28c3bec2c0a6de46d8c5ad6067c4ebfd4250da", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("248d97d7f76283d63bec30e7a5876c11c06fca9b275c671c5e33d95bb7e8d729", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("1a306d439d463b0816fc6fd64cc939318b45eb759ddde4aa106d15d9bd9baaaa", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("28a8f8372e3c38daced7c00421cb4621f4f1b54ddc27821b0d62d3d6ec7c56cf", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("0094975717f9a8a8bb35152f24d43294071ce320c829f388bc852183e1e2ce7e", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("04d5ee4c3aa78f7d80fde60d716480d3593f74d4f653ae83f4103246db2e8d65", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("2a6cf5e9aa03d4336349ad6fb8ed2269c7bef54b8822cc76d08495c12efde187", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("2304d31eaab960ba9274da43e19ddeb7f792180808fd6e43baae48d7efcba3f3", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("03fd9ac865a4b2a6d5e7009785817249bff08a7e0726fcb4e1c11d39d199f0b0", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("00b7258ded52bbda2248404d55ee5044798afc3a209193073f7954d4d63b0b64", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("159f81ada0771799ec38fca2d4bf65ebb13d3a74f3298db36272c5ca65e92d9a", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("1ef90e67437fbc8550237a75bc28e3bb9000130ea25f0c5471e144cf4264431f", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("1e65f838515e5ff0196b49aa41a2d2568df739bc176b08ec95a79ed82932e30d", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("2b1b045def3a166cec6ce768d079ba74b18c844e570e1f826575c1068c94c33f", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("0832e5753ceb0ff6402543b1109229c165dc2d73bef715e3f1c6e07c168bb173", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("02f614e9cedfb3dc6b762ae0a37d41bab1b841c2e8b6451bc5a8e3c390b6ad16", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("0e2427d38bd46a60dd640b8e362cad967370ebb777bedff40f6a0be27e7ed705", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("0493630b7c670b6deb7c84d414e7ce79049f0ec098c3c7c50768bbe29214a53a", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("22ead100e8e482674decdab17066c5a26bb1515355d5461a3dc06cc85327cea9", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("25b3e56e655b42cdaae2626ed2554d48583f1ae35626d04de5084e0b6d2a6f16", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("1e32752ada8836ef5837a6cde8ff13dbb599c336349e4c584b4fdc0a0cf6f9d0", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("2fa2a871c15a387cc50f68f6f3c3455b23c00995f05078f672a9864074d412e5", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("2f569b8a9a4424c9278e1db7311e889f54ccbf10661bab7fcd18e7c7a7d83505", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("044cb455110a8fdd531ade530234c518a7df93f7332ffd2144165374b246b43d", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("227808de93906d5d420246157f2e42b191fe8c90adfe118178ddc723a5319025", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("02fcca2934e046bc623adead873579865d03781ae090ad4a8579d2e7a6800355", 16),
            ZERO, ZERO, ZERO
        ))
        add(listOf(
            BigInteger("0ef915f0ac120b876abccceb344a1d36bad3f3c5ab91a8ddcbec2e060d8befac", 16),
            ZERO, ZERO, ZERO
        ))

        // Last 4 full rounds
        add(listOf(
            BigInteger("1797130f4b7a3e1777eb757bc6f287f6ab0fb85f6be63b09f3b16ef2b1405d38", 16),
            BigInteger("0a76225dc04170ae3306c85abab59e608c7f497c20156d4d36c668555decc6e5", 16),
            BigInteger("1fffb9ec1992d66ba1e77a7b93209af6f8fa76d48acb664796174b5326a31a5c", 16),
            BigInteger("25721c4fc15a3f2853b57c338fa538d85f8fbba6c6b9c6090611889b797b9c5f", 16)
        ))
        add(listOf(
            BigInteger("0c817fd42d5f7a41215e3d07ba197216adb4c3790705da95eb63b982bfcaf75a", 16),
            BigInteger("13abe3f5239915d39f7e13c2c24970b6df8cf86ce00a22002bc15866e52b5a96", 16),
            BigInteger("2106feea546224ea12ef7f39987a46c85c1bc3dc29bdbd7a92cd60acb4d391ce", 16),
            BigInteger("21ca859468a746b6aaa79474a37dab49f1ca5a28c748bc7157e1b3345bb0f959", 16)
        ))
        add(listOf(
            BigInteger("05ccd6255c1e6f0c5cf1f0df934194c62911d14d0321662a8f1a48999e34185b", 16),
            BigInteger("0f0e34a64b70a626e464d846674c4c8816c4fb267fe44fe6ea28678cb09490a4", 16),
            BigInteger("0558531a4e25470c6157794ca36d0e9647dbfcfe350d64838f5b1a8a2de0d4bf", 16),
            BigInteger("09d3dca9173ed2faceea125157683d18924cadad3f655a60b72f5864961f1455", 16)
        ))
        add(listOf(
            BigInteger("0328cbd54e8c0913493f866ed03d218bf23f92d68aaec48617d4c722e5bd4335", 16),
            BigInteger("2bf07216e2aff0a223a487b1a7094e07e79e7bcc9798c648ee3347dd5329d34b", 16),
            BigInteger("1daf345a58006b736499c583cb76c316d6f78ed6a6dffc82111e11a63fe412df", 16),
            BigInteger("176563472456aaa746b694c60e1823611ef39039b2edc7ff391e6f2293d2c404", 16)
        ))
    }

    private fun add(x: BigInteger, y: BigInteger): BigInteger {
        return (x + y).mod(PRIME)
    }

    private fun sub(x: BigInteger, y: BigInteger): BigInteger {
        return (PRIME + x - y).mod(PRIME)
    }

    private fun mul(x: BigInteger, y: BigInteger): BigInteger {
        return (x * y).mod(PRIME)
    }

    private fun square(x: BigInteger): BigInteger {
        return (x * x).mod(PRIME)
    }

    private fun sbox(input: List<BigInteger>): MutableList<BigInteger> {
        return input.map { x -> sboxP(x) }.toMutableList()
    }

    private fun sboxP(input: BigInteger): BigInteger {
        val input2 = square(input)
        return when (D) {
            3 -> mul(input2, input)
            5 -> mul(square(input2), input)
            7 -> mul(square(input2), mul(input2, input))
            else -> throw IllegalArgumentException("Invalid d parameter, must be 3, 5 or 7")
        }
    }

    private fun matmulExternal(input: MutableList<BigInteger>): MutableList<BigInteger> {
        when (T) {
            2 -> {
                val sum = add(input[0], input[1])
                input[0] = add(input[0], sum)
                input[1] = add(input[1], sum)
            }
            3 -> {
                val sum = add(add(input[0], input[1]), input[2])
                input[0] = add(input[0], sum)
                input[1] = add(input[1], sum)
                input[2] = add(input[2], sum)
            }
            4, 8, 12, 16, 20, 24 -> {
                val t4 = T / 4
                for (i in 0 until t4) {
                    val startIndex = i * 4
                    var t0 = input[startIndex]
                    t0 = add(t0, input[startIndex + 1])

                    var t1 = input[startIndex + 2]
                    t1 = add(t1, input[startIndex + 3])

                    var t2 = input[startIndex + 1]
                    t2 = add(t2, t2)
                    t2 = add(t2, t1)

                    var t3 = input[startIndex + 3]
                    t3 = add(t3, t3)
                    t3 = add(t3, t0)

                    var t4 = t1
                    t4 = add(t4, t4)
                    t4 = add(t4, t4)
                    t4 = add(t4, t3)

                    var t5 = t0
                    t5 = add(t5, t5)
                    t5 = add(t5, t5)
                    t5 = add(t5, t2)

                    var t6 = t3
                    t6 = add(t6, t5)

                    var t7 = t2
                    t7 = add(t7, t4)

                    input[startIndex] = t6
                    input[startIndex + 1] = t5
                    input[startIndex + 2] = t7
                    input[startIndex + 3] = t4
                }

                if (T > 4) {
                    val stored = MutableList(4) { ZERO }
                    for (l in 0 until 4) {
                        stored[l] = input[l]
                        for (j in 1 until t4) {
                            stored[l] = add(stored[l], input[4 * j + l])
                        }
                    }
                    for (i in input.indices) {
                        input[i] = add(input[i], stored[i % 4])
                    }
                }
            }
            else -> throw IllegalArgumentException("Invalid t parameter, must be 2, 3, 4, 8, 12, 16, 20 or 24")
        }
        return input
    }

    private fun matmulInternal(input: MutableList<BigInteger>): MutableList<BigInteger> {
        when (T) {
            2 -> {
                val sum = add(input[0], input[1])
                input[0] = add(input[0], sum)
                input[1] = add(add(input[1], input[1]), sum)
            }
            3 -> {
                val sum = add(add(input[0], input[1]), input[2])
                input[0] = add(input[0], sum)
                input[1] = add(input[1], sum)
                input[2] = add(add(input[2], input[2]), sum)
            }
            4, 8, 12, 16, 20, 24 -> {
                var sum = input[0]
                for (i in 1 until T) {
                    sum = add(sum, input[i])
                }
                for (i in input.indices) {
                    input[i] = add(mul(MAT_INTERNAL_DIAG_M_1[i], input[i]), sum)
                }
            }
            else -> throw IllegalArgumentException("Invalid t parameter, must be 2, 3, 4, 8, 12, 16, 20 or 24")
        }
        return input
    }

    private fun permute(input: List<BigInteger>): MutableList<BigInteger> {
        if (input.size != T) {
            throw IllegalArgumentException("Invalid input length")
        }
        var currentState = input.toMutableList()
        matmulExternal(currentState)
        
        for (r in 0 until roundsFBeginning) {
            currentState = addRc(currentState, roundConstants[r])
            currentState = sbox(currentState)
            matmulExternal(currentState)
        }
        
        val pEnd = roundsFBeginning + roundsP
        for (r in roundsFBeginning until pEnd) {
            currentState[0] = add(currentState[0], roundConstants[r][0])
            currentState[0] = sboxP(currentState[0])
            matmulInternal(currentState)
        }
        
        for (r in pEnd until rounds) {
            currentState = addRc(currentState, roundConstants[r])
            currentState = sbox(currentState)
            matmulExternal(currentState)
        }
        
        return currentState
    }

    private fun addRc(input: List<BigInteger>, rc: List<BigInteger>): MutableList<BigInteger> {
        return input.mapIndexed { i, a -> add(a, rc[i]) }.toMutableList()
    }

    enum class Mode {
        ABSORB,
        SQUEEZE
    }

    class FieldSponge(private val domainIv: BigInteger = BigInteger.ZERO) {
        private val rate: Int = T - 1
        private val t: Int = T
        private var state: MutableList<BigInteger> = MutableList(t) { BigInteger.ZERO }
        private var cache: MutableList<BigInteger> = MutableList(rate) { BigInteger.ZERO }
        private var cacheSize: Int = 0
        private var mode: Mode = Mode.ABSORB

        init {
            state[rate] = domainIv
        }

        private fun performDuplex(): List<BigInteger> {
            // Zero-pad the cache
            for (i in cacheSize until rate) {
                cache[i] = BigInteger.ZERO
            }
            // Add cache into sponge state
            for (i in 0 until rate) {
                state[i] = add(state[i], cache[i])
            }
            state = permute(state)

            // Return rate number of elements from state
            return state.subList(0, rate)
        }

        fun absorb(input: BigInteger) {
            when {
                mode == Mode.ABSORB && cacheSize == rate -> {
                    performDuplex()
                    cache[0] = input
                    cacheSize = 1
                }
                mode == Mode.ABSORB && cacheSize < rate -> {
                    cache[cacheSize] = input
                    cacheSize += 1
                }
                mode == Mode.SQUEEZE -> {
                    cache[0] = input
                    cacheSize = 1
                    mode = Mode.ABSORB
                }
            }
        }

        fun squeeze(): BigInteger {
            if (mode == Mode.SQUEEZE && cacheSize == 0) {
                mode = Mode.ABSORB
                cacheSize = 0
            }
            if (mode == Mode.ABSORB) {
                val newOutputElements = performDuplex()
                mode = Mode.SQUEEZE
                for (i in 0 until rate) {
                    cache[i] = newOutputElements[i]
                }
                cacheSize = rate
            }

            val result = cache[0]
            for (i in 1 until cacheSize) {
                cache[i - 1] = cache[i]
            }
            cacheSize -= 1
            cache[cacheSize] = BigInteger.ZERO
            return result
        }

        companion object {
            private fun hashInternal(
                input: List<BigInteger>,
                outLen: Int,
                isVariableLength: Boolean
            ): List<BigInteger> {
                val iv = (BigInteger.valueOf(input.size.toLong()) shl 64) + BigInteger.valueOf((outLen - 1).toLong())
                val sponge = FieldSponge(iv)

                for (element in input) {
                    sponge.absorb(element)
                }

                if (isVariableLength) {
                    sponge.absorb(BigInteger.ONE)
                }

                return List(outLen) { sponge.squeeze() }
            }

            fun hashFixedLength(input: List<BigInteger>, outLen: Int = 1): List<BigInteger> {
                return hashInternal(input, outLen, false)
            }

            fun hashVariableLength(input: List<BigInteger>, outLen: Int = 1): List<BigInteger> {
                return hashInternal(input, outLen, true)
            }
        }
    }

    fun hash(input: List<BigInteger>): BigInteger {
        return FieldSponge.hashFixedLength(input)[0]
    }

    fun hexToBigInteger(hex: String): BigInteger {
        val cleanHex = if (hex.startsWith("0x")) hex.substring(2) else hex
        return BigInteger(cleanHex, 16)
    }

    fun bigIntegerToHex(value: BigInteger): String {
        return "0x" + value.toString(16)
    }
} 